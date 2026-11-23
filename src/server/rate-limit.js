/**
 * Rate limiting.
 *
 * Three features grew their own answer to this question before it existed —
 * an email-resend cooldown enforced by the token table, and a per-user lockout
 * on each second factor. Those solved their own case correctly but left the
 * obvious hole open: password guessing on the login endpoint was unthrottled.
 *
 * ## Sliding window, not fixed
 *
 * A fixed window lets a caller spend the whole allowance at the end of one
 * window and again at the start of the next, so a "5 per minute" limit permits
 * 10 in two seconds. This keeps the timestamps of recent hits and counts the
 * ones still inside the window, which costs an array per key and removes the
 * boundary burst entirely. Auth limits are small, so the array stays small.
 *
 * ## Two stores
 *
 * Memory is the default and is per-process: fine for smoothing traffic, wrong
 * for a lockout, because a restart clears it and a second instance does not
 * see it. The database store is the one to use when the limit is a security
 * control rather than a courtesy.
 */

import { isIP } from 'node:net'
import { MemoryStore } from './rate-limit-stores.js'

export { MemoryStore, DatabaseStore } from './rate-limit-stores.js'

/**
 * Parse a duration.
 *
 * @param {number|string} value - ms, or '30s' / '15m' / '2h' / '1d'
 * @returns {number} milliseconds
 */
export function parseDuration(value) {
  if (typeof value === 'number') return value

  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/)
  if (!match) throw new Error(`Cannot parse duration "${value}"`)

  const amount = Number(match[1])
  const unit = match[2] || 'ms'

  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return amount * multipliers[unit]
}

/**
 * What a limiter reports about one key.
 *
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed
 * @property {number} limit
 * @property {number} remaining
 * @property {number} resetAt - epoch ms
 * @property {number} retryAfter - seconds; 0 while allowed
 */

/**
 * @typedef {Object} Limiter
 * @property {(key: string) => Promise<RateLimitResult>} consume - record a hit
 * @property {(key: string) => Promise<RateLimitResult>} peek - read without recording
 * @property {(key: string) => Promise<void>} reset
 * @property {Object} store
 */

/**
 * @typedef {Object} LimiterOptions
 * @property {number} limit - hits allowed per window
 * @property {number|string} [window] - the window (default '1m')
 * @property {Object} [store]
 * @property {number|string} [blockFor] - after the limit, refuse for this
 *   long regardless of the window. Turns a throttle into a lockout.
 * @property {() => number} [now] - the clock, defaulting to Date.now.
 *   Injectable so tests can advance time exactly instead of sleeping. A test
 *   that waits 80ms for a 300ms lockout passes on a quiet laptop and fails on a
 *   loaded CI runner — that is a property of the test, not of the limiter.
 */

/**
 * Create a limiter.
 *
 * @param {LimiterOptions} options
 * @returns {Limiter}
 */
export function createLimiter({ limit, window, store, blockFor, now: clock = Date.now } = {}) {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('createLimiter requires a positive limit')
  }

  const windowMs = parseDuration(window ?? '1m')
  const blockMs = blockFor === undefined ? null : parseDuration(blockFor)
  const backing = store || new MemoryStore()

  return {
    /**
     * Record a hit and report whether it is allowed.
     *
     * @param {string} key
     * @returns {Promise<{ allowed: boolean, remaining: number, retryAfter: number, resetAt: number, limit: number }>}
     */
    async consume(key) {
      const now = clock()
      const state = await backing.hit(String(key), { windowMs, now, limit, blockMs })

      return describe(state, limit, now)
    },

    /**
     * Report the current state without recording a hit.
     *
     * Useful when a request should only count against the limit if it fails —
     * a correct password should not consume the guess allowance.
     *
     * @param {string} key
     */
    async peek(key) {
      const now = clock()
      const state = await backing.peek(String(key), { windowMs, now, limit })

      return describe(state, limit, now)
    },

    /**
     * Clear a key. Call this on success so a legitimate user who mistyped a
     * password twice is not still part-way to a lockout.
     *
     * @param {string} key
     */
    async reset(key) {
      await backing.reset(String(key))
    },

    /** Exposed so a caller can share or inspect the store. */
    store: backing
  }
}

function describe(state, limit, now) {
  const remaining = Math.max(0, limit - state.count)
  const allowed = !state.blocked && state.count <= limit

  const resetAt = state.blockedUntil || state.resetAt || now

  return {
    allowed,
    limit,
    remaining: allowed ? remaining : 0,
    resetAt,
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
  }
}

/**
 * Rate-limiting middleware.
 *
 * Takes everything createLimiter takes, plus the options below. Pass `limiter`
 * instead of `limit`/`window` to share one limiter across several routes.
 *
 * @param {(LimiterOptions | { limiter: Limiter }) & {
 *   key?: (req: any) => string|null|undefined,
 *   trustProxy?: boolean|number,
 *   onLimited?: (req: any, res: any, info: RateLimitResult) => void,
 *   headers?: boolean,
 *   message?: string
 * }} options - `key` returning nothing lets the request through: one shared
 *   bucket for unidentifiable callers is worse than no limit at all.
 * @returns {Function & { limiter: Limiter, key: (req: any) => string|null|undefined }} middleware
 */
export function rateLimit(options = {}) {
  const limiter = options.limiter || createLimiter(options)
  const keyFor = options.key || ((req) => clientAddress(req, options.trustProxy))
  const emitHeaders = options.headers !== false

  const middleware = async (req, res, next) => {
    const key = keyFor(req)

    // A limiter that cannot identify the caller would apply one shared bucket to
    // everyone, which is worse than not limiting: one abuser locks out the site.
    if (!key) return next()

    const result = await limiter.consume(key)

    if (emitHeaders) {
      res.setHeader('RateLimit-Limit', String(result.limit))
      res.setHeader('RateLimit-Remaining', String(result.remaining))
      res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
    }

    if (result.allowed) return next()

    res.setHeader('Retry-After', String(result.retryAfter))

    if (options.onLimited) {
      return options.onLimited(req, res, result)
    }

    return res.json(
      { error: options.message || 'Too many requests. Please try again shortly.', retryAfter: result.retryAfter },
      429
    )
  }

  // The limiter and the key function are attached so a handler can clear a key
  // once the request turns out to be legitimate — a correct password should not
  // leave the caller part-way to a lockout.
  middleware.limiter = limiter
  middleware.key = keyFor

  return middleware
}

/**
 * Work out who is calling.
 *
 * **X-Forwarded-For is only consulted when trustProxy is set**, and that is not
 * a default worth having: the header is client-supplied, so honouring it on a
 * directly-exposed server lets anyone rotate their apparent address and bypass
 * every limit here. Behind a proxy that overwrites the header, set it.
 *
 * Even then only the entries the proxies appended can be believed. Each proxy
 * appends the address it received the request from, so the client's address
 * is the one *your* proxies added — counted from the right. The left-most
 * entry is whatever the client sent, which is why reading it (as this once
 * did) made trustProxy a bypass rather than a fix.
 *
 * - `trustProxy: true` — one proxy in front (the common case): the right-most entry.
 * - `trustProxy: n` — n proxies in front: the n-th entry from the right. A
 *   shorter header yields its left-most entry, as Express does.
 *
 * The result is normalised so one client cannot hold many keys: an
 * IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) is reported as the IPv4 address,
 * and an IPv6 address as its /64 — a single subscriber is routinely handed a
 * whole /64, and keying on the full address gave them 2⁶⁴ budgets.
 *
 * @param {Object} req
 * @param {boolean|number} [trustProxy] - `true` = one hop; a number = that many hops
 * @returns {string}
 */
export function clientAddress(req, trustProxy = false) {
  const hops = trustProxy === true ? 1 : Math.max(0, Math.floor(Number(trustProxy) || 0))

  if (hops > 0) {
    const forwarded = req.headers?.['x-forwarded-for']
    if (forwarded) {
      const entries = String(forwarded).split(',').map((entry) => entry.trim()).filter(Boolean)
      if (entries.length) {
        const chosen = entries[Math.max(0, entries.length - hops)]
        return normalizeAddress(chosen)
      }
    }

    const real = req.headers?.['x-real-ip']
    if (real) return normalizeAddress(String(real).trim())
  }

  return normalizeAddress(req.socket?.remoteAddress || req.connection?.remoteAddress || '')
}

/**
 * Reduce an address to the key a client is limited under.
 *
 * @param {string} address
 * @returns {string} an IPv4 address, an IPv6 /64 as `xxxx:xxxx:xxxx:xxxx::/64`,
 *   or the input unchanged when it is not an address at all
 */
export function normalizeAddress(address) {
  let value = String(address || '').trim()

  // Some proxies include the port: `1.2.3.4:5678`, `[2001:db8::1]:443`.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) value = bracketed[1]
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(':'))

  // A zone index (`fe80::1%eth0`) names an interface, not a different host.
  value = value.replace(/%.*$/, '')

  const mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value)
  if (mapped && isIP(mapped[1]) === 4) return mapped[1]

  if (isIP(value) !== 6) return value

  const groups = expandIPv6(value)
  if (!groups) return value

  // Hex-spelled IPv4-mapped: ::ffff:102:304.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
  }

  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`
}

/** Eight 16-bit groups of a valid IPv6 literal, or null. */
function expandIPv6(address) {
  let text = address.toLowerCase()

  // A trailing dotted quad is two groups.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number)
    text = text.slice(0, v4.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null

  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}
