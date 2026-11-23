/**
 * Webhook delivery tests.
 *
 * The properties worth asserting are the ones a receiver depends on: that the
 * signature covers the exact bytes sent, that verification is not fooled by a
 * near-miss, and that one broken receiver does not take the others with it.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { createServer } from 'node:http'
import { sign, verify, deliver, isPrivateAddress } from './webhooks.js'

const SECRET = 'test-app-key'

describe('sign / verify', () => {
  test('a signature verifies against its own body', () => {
    const body = JSON.stringify({ event: 'post.created', id: 1 })

    assert.strictEqual(verify(body, sign(body, SECRET), SECRET), true)
  })

  test('a changed body does not verify', () => {
    const signature = sign('{"id":1}', SECRET)

    assert.strictEqual(verify('{"id":2}', signature, SECRET), false)
  })

  test('a different secret does not verify', () => {
    const body = '{"id":1}'

    assert.strictEqual(verify(body, sign(body, 'other'), SECRET), false)
  })

  test('re-serialising the body breaks it, which is the point', () => {
    // A receiver that parses and re-stringifies before verifying gets a
    // different byte sequence. Key order happens to survive a round trip in V8,
    // so this uses whitespace and number formatting, which do not — and a
    // receiver cannot rely on any of it either way.
    const body = '{"a": 1, "n": 1.0}'
    const signature = sign(body, SECRET)

    assert.notStrictEqual(JSON.stringify(JSON.parse(body)), body, 'pick a body that actually differs')
    assert.strictEqual(verify(JSON.stringify(JSON.parse(body)), signature, SECRET), false)
  })

  test('a malformed signature is refused rather than throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the lengths are compared
    // first. Without that this is a crash, not a rejection.
    assert.strictEqual(verify('{}', 'sha256=short', SECRET), false)
    assert.strictEqual(verify('{}', '', SECRET), false)
    assert.strictEqual(verify('{}', undefined, SECRET), false)
  })
})

describe('deliver', () => {
  test('posts a signed payload to every url', async () => {
    const seen = []
    const fetchImpl = async (url, init) => {
      seen.push({ url, init })
      return { ok: true, status: 200 }
    }

    const results = await deliver({
      urls: ['https://a.example.com/hook', 'https://b.example.com/hook'],
      event: 'post.created',
      data: { id: 7, slug: 'hello' },
      secret: SECRET,
      allowPrivate: true,
      fetch: fetchImpl
    })

    assert.strictEqual(seen.length, 2)
    assert.ok(results.every((r) => r.ok))

    const { init } = seen[0]
    assert.strictEqual(init.method, 'POST')
    assert.strictEqual(init.headers['X-BasicBen-Event'], 'post.created')

    const payload = JSON.parse(init.body)
    assert.strictEqual(payload.event, 'post.created')
    assert.strictEqual(payload.id, 7)
    assert.strictEqual(payload.slug, 'hello')
    assert.ok(payload.at, 'no timestamp')

    // The signature has to cover what was actually sent, and the timestamp.
    const timestamp = init.headers['X-BasicBen-Timestamp']
    assert.match(timestamp, /^\d+$/)
    assert.strictEqual(verify(init.body, init.headers['X-BasicBen-Signature'], SECRET, { timestamp }), true)
    assert.strictEqual(init.redirect, 'manual')
  })

  test('every receiver gets identical bytes', async () => {
    // Serialising per-receiver would put a different `at` in each body, so one
    // signature would not describe them all — and a consumer comparing two
    // deliveries of the same event would see them differ.
    const bodies = []
    const fetchImpl = async (_url, init) => {
      bodies.push(init.body)
      return { ok: true, status: 200 }
    }

    await deliver({
      urls: ['https://a.example.com', 'https://b.example.com', 'https://c.example.com'],
      event: 'post.updated',
      data: { id: 1 },
      secret: SECRET,
      allowPrivate: true,
      fetch: fetchImpl
    })

    assert.strictEqual(new Set(bodies).size, 1)
  })

  test('one broken receiver does not stop the others', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('broken')) throw new Error('ECONNREFUSED')
      return { ok: true, status: 200 }
    }

    const results = await deliver({
      urls: ['https://broken.example.com', 'https://fine.example.com'],
      event: 'post.created',
      data: {},
      secret: SECRET,
      allowPrivate: true,
      fetch: fetchImpl
    })

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].ok, false)
    assert.match(results[0].error, /ECONNREFUSED/)
    assert.strictEqual(results[1].ok, true)
  })

  test('a non-2xx is reported, not thrown', async () => {
    const results = await deliver({
      urls: ['https://a.example.com'],
      event: 'post.created',
      data: {},
      secret: SECRET,
      allowPrivate: true,
      fetch: async () => ({ ok: false, status: 500 })
    })

    assert.deepStrictEqual(results, [{ url: 'https://a.example.com', ok: false, status: 500 }])
  })

  test('no urls means no work and no error', async () => {
    let called = false

    assert.deepStrictEqual(
      await deliver({ urls: [], event: 'x', secret: SECRET, fetch: async () => { called = true } }),
      []
    )
    assert.strictEqual(called, false)
    assert.deepStrictEqual(await deliver({ event: 'x', secret: SECRET }), [])
  })

  test('a hanging receiver is abandoned', async () => {
    // Without the timeout a single unresponsive URL holds a request open for as
    // long as the socket stays alive.
    const fetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      })

    const results = await deliver({
      urls: ['https://slow.example.com'],
      event: 'post.created',
      data: {},
      secret: SECRET,
      timeout: 20,
      allowPrivate: true,
      fetch: fetchImpl
    })

    assert.strictEqual(results[0].ok, false)
  })
})

describe('timestamped signatures', () => {
  const body = '{"event":"post.created"}'
  const now = 1_800_000_000

  test('a fresh timestamp verifies', () => {
    const signature = sign(body, SECRET, now)
    assert.strictEqual(verify(body, signature, SECRET, { timestamp: String(now), now: now + 10 }), true)
  })

  test('a replay outside the tolerance is refused', () => {
    const signature = sign(body, SECRET, now)
    assert.strictEqual(verify(body, signature, SECRET, { timestamp: String(now), now: now + 301 }), false)
  })

  test('a timestamp cannot be swapped for a fresher one', () => {
    const signature = sign(body, SECRET, now)
    assert.strictEqual(verify(body, signature, SECRET, { timestamp: String(now + 100), now: now + 100 }), false)
  })

  test('a timestamped signature does not verify as body-only', () => {
    assert.strictEqual(verify(body, sign(body, SECRET, now), SECRET), false)
  })
})

describe('deliver safety', () => {
  const quiet = async (fn) => {
    const error = console.error
    console.error = () => {}
    try { return await fn() } finally { console.error = error }
  }

  test('a missing secret throws instead of signing with "undefined"', async () => {
    await assert.rejects(
      deliver({ urls: ['https://a.example.com'], event: 'x', fetch: async () => ({ ok: true, status: 200 }) }),
      /secret is required/
    )
    assert.throws(() => sign('{}', undefined), /secret is required/)
  })

  test('data cannot override the event', async () => {
    let sent
    await deliver({
      urls: ['https://a.example.com'],
      event: 'post.created',
      data: { event: 'user.deleted', id: 1 },
      secret: SECRET,
      allowPrivate: true,
      fetch: async (_url, init) => { sent = JSON.parse(init.body); return { ok: true, status: 200 } }
    })

    assert.strictEqual(sent.event, 'post.created')
    assert.strictEqual(sent.id, 1)
  })

  test('non-public addresses are refused', async () => {
    let called = 0
    const results = await quiet(() => deliver({
      urls: [
        'http://127.0.0.1/hook', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/',
        'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://100.64.0.1/', 'http://[fd00::1]/', 'file:///etc/passwd'
      ],
      event: 'post.created',
      secret: SECRET,
      fetch: async () => { called++; return { ok: true, status: 200 } }
    }))

    assert.strictEqual(called, 0)
    assert.ok(results.every((r) => r.ok === false), JSON.stringify(results))
  })

  test('a hostname resolving to loopback is refused by the built-in transport', async () => {
    const results = await quiet(() => deliver({ urls: ['http://localhost:9/'], event: 'x', secret: SECRET }))
    assert.strictEqual(results[0].ok, false)
    assert.match(results[0].error, /not a public address/)
  })

  test('isPrivateAddress', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:10.0.0.1', 'not-an-ip']) {
      assert.strictEqual(isPrivateAddress(address), true, address)
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      assert.strictEqual(isPrivateAddress(address), false, address)
    }
  })

  test('the built-in transport delivers, signs, and does not follow redirects', async () => {
    const received = []
    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, raw })
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/elsewhere' })
          return res.end()
        }
        res.end('a body nobody reads')
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`

    try {
      const results = await quiet(() => deliver({
        urls: [`${base}/hook`, `${base}/redirect`],
        event: 'post.created',
        data: { id: 3 },
        secret: SECRET,
        allowPrivate: true
      }))

      assert.deepStrictEqual(results.map((r) => [r.ok, r.status]), [[true, 200], [false, 302]])
      assert.deepStrictEqual(received.map((r) => r.url).sort(), ['/hook', '/redirect'])

      const hook = received.find((r) => r.url === '/hook')
      assert.strictEqual(
        verify(hook.raw, hook.headers['x-basicben-signature'], SECRET, { timestamp: hook.headers['x-basicben-timestamp'] }),
        true
      )
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
