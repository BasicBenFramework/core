/**
 * Body parser tests, focused on the opt-out.
 *
 * The property that matters for `skip` is not "req.body is undefined" — it is
 * that the *stream was never read*. A parser that drains the request and then
 * declines to set `req.body` leaves the route with nothing to consume, which is
 * the failure this option exists to prevent.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { Readable } from 'node:stream'
import { bodyParser, json } from './body-parser.js'

/**
 * A request whose stream reports whether anything consumed it.
 *
 * Chunks are Buffers because that is what a real `http.IncomingMessage` emits,
 * and `readBody` concatenates them as such — a string-yielding double would
 * pass tests the real parser fails.
 */
function request({ method = 'POST', path = '/api/posts', body = '', contentType = 'application/json' } = {}) {
  const stream = Readable.from([Buffer.from(body)])

  const req = Object.assign(stream, {
    method,
    path,
    url: path,
    headers: contentType ? { 'content-type': contentType } : {}
  })

  req.wasRead = false
  const originalOn = stream.on.bind(stream)
  req.on = (event, handler) => {
    if (event === 'data') req.wasRead = true
    return originalOn(event, handler)
  }

  return req
}

function response() {
  return { statusCode: 200, ended: false, end() { this.ended = true } }
}

const run = (middleware, req) =>
  new Promise((resolve, reject) => {
    middleware(req, response(), (err) => (err ? reject(err) : resolve()))
  })

describe('bodyParser', () => {
  test('parses JSON by default', async () => {
    const req = request({ body: '{"title":"hi"}' })
    await run(bodyParser(), req)

    assert.deepStrictEqual(req.body, { title: 'hi' })
  })

  test('parses url-encoded bodies', async () => {
    const req = request({
      body: 'a=1&b=2',
      contentType: 'application/x-www-form-urlencoded'
    })
    await run(bodyParser(), req)

    // Spread: the parsed body has a null prototype (see parseUrlEncoded).
    assert.deepStrictEqual({ ...req.body }, { a: '1', b: '2' })
  })

  test('skips GET without reading', async () => {
    const req = request({ method: 'GET' })
    await run(bodyParser(), req)

    assert.strictEqual(req.wasRead, false)
  })
})

describe('bodyParser skip', () => {
  test('a matching prefix leaves the stream unread', async () => {
    const req = request({ path: '/api/webhooks/stripe', body: '{"a":1}' })
    await run(bodyParser({ skip: '/api/webhooks/' }), req)

    assert.strictEqual(req.wasRead, false, 'the stream was consumed despite skip')
    assert.strictEqual(req.body, undefined)
  })

  test('a non-matching path still parses', async () => {
    const req = request({ path: '/api/posts', body: '{"a":1}' })
    await run(bodyParser({ skip: '/api/webhooks/' }), req)

    assert.deepStrictEqual(req.body, { a: 1 })
  })

  test('accepts a list of prefixes', async () => {
    const skip = ['/api/webhooks/', '/api/raw/']

    const hook = request({ path: '/api/raw/thing', body: 'x' })
    await run(bodyParser({ skip }), hook)
    assert.strictEqual(hook.wasRead, false)

    const normal = request({ path: '/api/posts', body: '{"a":1}' })
    await run(bodyParser({ skip }), normal)
    assert.deepStrictEqual(normal.body, { a: 1 })
  })

  test('accepts a predicate', async () => {
    const skip = (req) => req.headers['content-type'] === 'application/octet-stream'

    const binary = request({ body: 'raw', contentType: 'application/octet-stream' })
    await run(bodyParser({ skip }), binary)
    assert.strictEqual(binary.wasRead, false)
  })

  test('the skipped body is still readable by the route', async () => {
    // The whole point: a webhook handler computes its signature over these
    // exact bytes, so they must still be in the stream when it runs.
    const payload = '{"id":"evt_1","amount":  100}'
    const req = request({ path: '/api/webhooks/stripe', body: payload })

    await run(bodyParser({ skip: '/api/webhooks/' }), req)

    let received = ''
    for await (const chunk of req) received += chunk

    assert.strictEqual(received, payload)
  })
})

describe('json skip', () => {
  test('honours the same option', async () => {
    const req = request({ path: '/api/webhooks/x', body: '{"a":1}' })
    await run(json({ skip: '/api/webhooks/' }), req)

    assert.strictEqual(req.wasRead, false)
    assert.strictEqual(req.body, undefined)
  })
})

describe('urlencoded keys', () => {
  test('__proto__, constructor and prototype are ignored, not a 500', async () => {
    const { parseUrlEncoded } = await import('./body-parser.js')
    const body = parseUrlEncoded('__proto__[]=x&__proto__=y&constructor[]=z&prototype=p&name=ok')

    assert.strictEqual(Object.getPrototypeOf(body), null)
    assert.deepStrictEqual(Object.keys(body), ['name'])
    assert.strictEqual(({}).x, undefined, 'Object.prototype is untouched')
  })

  test('a scalar followed by array notation keeps both values', async () => {
    const { parseUrlEncoded } = await import('./body-parser.js')
    assert.deepStrictEqual({ ...parseUrlEncoded('a=1&a[]=2&a[]=3') }, { a: ['1', '2', '3'] })
  })

  test('hasOwnProperty-named fields are just fields', async () => {
    const { parseUrlEncoded } = await import('./body-parser.js')
    assert.strictEqual(parseUrlEncoded('hasOwnProperty=1').hasOwnProperty, '1')
  })
})
