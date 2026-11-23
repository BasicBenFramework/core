/**
 * Outbound webhooks.
 *
 * A headless consumer's whole workflow is *content changed → rebuild*. Without
 * a notification it polls, which is wasteful when nothing changed and slow when
 * something did. This is the other half of the content API.
 *
 * ## No retry queue
 *
 * A failed delivery is logged and dropped. Retrying properly means a durable
 * queue — a table, a worker, a backoff schedule that survives a restart — and
 * this framework has none of those. A retry loop held in memory would lose
 * everything on the next deploy while looking like it guarantees delivery,
 * which is worse than being clear that it does not.
 *
 * So: at-most-once. A consumer that cannot miss an event should treat webhooks
 * as a latency optimisation and poll as the backstop. That is a real limitation
 * and it is documented rather than papered over.
 *
 * ## Signing
 *
 * Every request carries two headers:
 *
 * - `X-BasicBen-Timestamp: <unix seconds>`
 * - `X-BasicBen-Signature: sha256=<hex>`, an HMAC-SHA256 of
 *   `` `${timestamp}.${body}` `` — the timestamp, a dot, and the exact bytes sent.
 *
 * The key is the `secret` passed to `deliver` (a dedicated webhook secret, not
 * APP_KEY: every receiver has to hold it). Signing the timestamp is what makes
 * a captured delivery useless later: `verify` refuses one older than five
 * minutes, so replaying it means forging a new signature. A receiver must
 * compute the HMAC over the raw body — a body parsed and re-serialised does not
 * reproduce it, which is why `bodyParser` grew a `skip` option.
 *
 * ## Where deliveries may go
 *
 * Receiver URLs are typed into an admin screen, which makes this a request the
 * server sends on someone else's say-so. Pointed at `http://169.254.169.254/`
 * it would POST to the cloud metadata service; at `http://localhost:6379` to
 * whatever listens there. So every address a receiver's host resolves to is
 * checked, and loopback, private, link-local, unique-local, CGNAT and other
 * non-public ranges are refused unless `allowPrivate: true` is passed.
 *
 * With the built-in transport the check runs inside the socket's own DNS
 * lookup, so the address connected to is the address that was checked — a
 * hostname cannot pass the check and then re-resolve somewhere internal (DNS
 * rebinding). A custom `fetch` gets the same check before the request, but
 * cannot be pinned; that window is the price of injecting one.
 *
 * Redirects are not followed — a public URL answering 302 to an internal one
 * is the classic way round a check like this — and response bodies are
 * discarded unread.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

/** How long to wait on a receiver before giving up. */
const DEFAULT_TIMEOUT = 5000

/** How old a signed timestamp `verify` accepts, in seconds. */
const DEFAULT_TOLERANCE = 300

/**
 * Address ranges a webhook may not be delivered to.
 *
 * Everything that is not the public internet: loopback, RFC 1918, CGNAT,
 * link-local (which is where 169.254.169.254, the metadata service, lives),
 * IPv6 unique-local and link-local, documentation and benchmarking ranges,
 * multicast and reserved space, and the IPv4-mapped / NAT64 prefixes through
 * which any of those can be spelled as IPv6.
 */
const NON_PUBLIC = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) NON_PUBLIC.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]
]) NON_PUBLIC.addSubnet(network, prefix, 'ipv6')

// Kept apart from NON_PUBLIC because BlockList matches an IPv4 address against
// IPv4-mapped IPv6 rules, so `::ffff:0:0/96` in that list blocks every IPv4
// address there is.
const IPV4_MAPPED = new BlockList()
IPV4_MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6')

/**
 * Whether an address is outside the public internet.
 *
 * @param {string} address - an IPv4 or IPv6 literal
 * @returns {boolean} true for anything that is not a valid public address
 */
export function isPrivateAddress(address) {
  const family = isIP(address)
  if (family === 0) return true

  // An IPv4-mapped IPv6 address (`::ffff:127.0.0.1`) reaches the IPv4
  // address underneath. No public receiver needs to be addressed that way, so
  // the whole prefix is refused, however it is spelled.
  if (family === 6 && IPV4_MAPPED.check(address, 'ipv6')) return true

  return NON_PUBLIC.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

/**
 * Sign a payload.
 *
 * @param {string} body - the exact bytes that will be sent
 * @param {string} secret
 * @param {number|string} [timestamp] - unix seconds; when given, the signed
 *   material is `${timestamp}.${body}`, as `deliver` sends
 * @returns {string} `sha256=<hex>`
 * @throws {Error} when the secret is missing
 */
export function sign(body, secret, timestamp) {
  requireSecret(secret)

  const material = timestamp === undefined ? body : `${timestamp}.${body}`
  return `sha256=${createHmac('sha256', secret).update(material).digest('hex')}`
}

/**
 * Verify a signature against a raw body.
 *
 * Pass the `X-BasicBen-Timestamp` header as `options.timestamp` — deliveries
 * sign it, and a timestamp outside `tolerance` (five minutes by default) is
 * refused, so a captured request cannot be replayed later. Without a
 * timestamp only a body-only signature verifies, which `deliver` no longer
 * sends.
 *
 * Compared with `timingSafeEqual`, so the check does not leak how much of a
 * forged signature was correct. Lengths are compared first because
 * `timingSafeEqual` throws on a mismatch rather than returning false.
 *
 * @param {string} body - the raw request body, exactly as received
 * @param {string} signature - the X-BasicBen-Signature header
 * @param {string} secret
 * @param {Object} [options]
 * @param {number|string} [options.timestamp] - the X-BasicBen-Timestamp header
 * @param {number} [options.tolerance] - seconds either side of now; default 300
 * @param {number} [options.now] - unix seconds, for tests
 * @returns {boolean}
 */
export function verify(body, signature, secret, options = {}) {
  if (typeof signature !== 'string') return false
  if (typeof secret !== 'string' || secret === '') return false

  let timestamp
  if (options.timestamp !== undefined && options.timestamp !== null) {
    if (!/^\d{1,12}$/.test(String(options.timestamp))) return false

    timestamp = Number(options.timestamp)
    const now = options.now ?? Math.floor(Date.now() / 1000)
    const tolerance = options.tolerance ?? DEFAULT_TOLERANCE
    if (Math.abs(now - timestamp) > tolerance) return false
  }

  const expected = Buffer.from(sign(body, secret, timestamp))
  const actual = Buffer.from(signature)

  if (expected.length !== actual.length) return false

  return timingSafeEqual(expected, actual)
}

/**
 * Deliver one event to every configured URL.
 *
 * Deliveries run concurrently and independently: one slow or broken receiver
 * must not delay or cancel the others. Nothing here throws once it has
 * started — a webhook failing must never fail the request that triggered it,
 * which is a content write the user already considers done. A missing secret
 * is the exception: that is a configuration error, and sending unsigned (or
 * signed with "undefined", as this once did) is worse than refusing.
 *
 * The payload is `{ ...data, event, at }`: `event` and `at` are set last, so
 * `data` cannot make a delivery claim to be a different event than the
 * `X-BasicBen-Event` header says.
 *
 * @param {Object} options
 * @param {string[]} options.urls
 * @param {string} options.event - e.g. 'post.created'
 * @param {Object} options.data - merged into the payload
 * @param {string} options.secret
 * @param {number} [options.timeout]
 * @param {boolean} [options.allowPrivate] - permit loopback/private/link-local
 *   receivers; off by default (see "Where deliveries may go")
 * @param {Function} [options.fetch] - replaces the built-in transport (tests)
 * @returns {Promise<Array<{url: string, ok: boolean, status?: number, error?: string}>>}
 * @throws {Error} when `secret` is missing
 */
export async function deliver({
  urls = [],
  event,
  data = {},
  secret,
  timeout = DEFAULT_TIMEOUT,
  allowPrivate = false,
  fetch: fetchImpl
} = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return []

  requireSecret(secret)

  // Serialised once, so every receiver gets identical bytes and the signature
  // means the same thing to all of them.
  const body = JSON.stringify({ ...data, event, at: new Date().toISOString() })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = sign(body, secret, timestamp)

  const headers = {
    'Content-Type': 'application/json',
    'X-BasicBen-Event': String(event),
    'X-BasicBen-Timestamp': String(timestamp),
    'X-BasicBen-Signature': signature
  }

  return Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('aborted')), timeout)

      try {
        let status

        if (fetchImpl) {
          if (!allowPrivate) await assertPublicDestination(url)

          const res = await fetchImpl(url, {
            method: 'POST',
            headers,
            body,
            redirect: 'manual',
            signal: controller.signal
          })
          status = res.status

          // Nothing is read from a receiver; releasing the body frees the
          // connection instead of leaving it buffered until garbage collection.
          await res.body?.cancel?.().catch(() => {})
        } else {
          status = await post(url, { headers, body, signal: controller.signal, allowPrivate })
        }

        const ok = status >= 200 && status < 300

        if (!ok) {
          console.error(`[webhooks] ${event} -> ${url} returned ${status}`)
        }

        return { url, ok, status }
      } catch (err) {
        // An unreachable receiver, a DNS failure, a refused address, or the
        // timeout above. All of them mean the same thing here: this event is gone.
        console.error(`[webhooks] ${event} -> ${url} failed: ${err.message}`)

        return { url, ok: false, error: err.message }
      } finally {
        clearTimeout(timer)
      }
    })
  )
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret === '') {
    throw new Error('A webhook secret is required to sign deliveries.')
  }
}

function parseReceiver(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('not a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`refusing ${parsed.protocol} URL`)
  }

  // URL keeps brackets around an IPv6 literal; isIP and lookup want it bare.
  return { parsed, host: parsed.hostname.replace(/^\[|\]$/g, '') }
}

function refuse(host, address) {
  const error = new Error(`refusing ${host}: ${address} is not a public address`)
  error.code = 'ERR_WEBHOOK_PRIVATE_ADDRESS'
  return error
}

/** Resolve every address of a receiver's host and refuse non-public ones. */
async function assertPublicDestination(url) {
  const { host } = parseReceiver(url)

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw refuse(host, host)
    return
  }

  const addresses = await new Promise((resolve, reject) => {
    dnsLookup(host, { all: true }, (err, found) => (err ? reject(err) : resolve(found)))
  })

  const bad = addresses.find(({ address }) => isPrivateAddress(address))
  if (bad) throw refuse(host, bad.address)
}

/**
 * The socket's DNS lookup, checking every address it resolves.
 *
 * Doing the check here rather than before the request is what pins the
 * connection to a checked address: there is no second resolution to rebind.
 */
function guardedLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)

    const bad = addresses.find(({ address }) => isPrivateAddress(address))
    if (bad) return callback(refuse(hostname, bad.address))

    if (options && options.all) return callback(null, addresses)
    return callback(null, addresses[0].address, addresses[0].family)
  })
}

/**
 * POST with node:http(s). Resolves with the status code; never follows a
 * redirect and never reads the response body.
 */
function post(url, { headers, body, signal, allowPrivate }) {
  const { parsed, host } = parseReceiver(url)

  // A literal address never reaches the lookup hook, so it is checked here.
  if (!allowPrivate && isIP(host) && isPrivateAddress(host)) {
    return Promise.reject(refuse(host, host))
  }

  const send = parsed.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = send(parsed, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      signal,
      ...(allowPrivate ? {} : { lookup: guardedLookup })
    }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })

    req.on('error', reject)
    req.end(body)
  })
}
