/**
 * Tests for the response helpers
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { addResponseHelpers } from './index.js'
import { createApp } from './http.js'

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    getHeader(k) { return this.headers[k.toLowerCase()] },
    end(data) { this.body = data }
  }
  addResponseHelpers({}, res, () => {})
  return res
}

describe('res.json', () => {
  test('defaults to 200', () => {
    const res = mockRes()
    res.json({ ok: true })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['content-type'], 'application/json')
    assert.deepStrictEqual(JSON.parse(res.body), { ok: true })
  })

  test('an explicit status wins', () => {
    const res = mockRes()
    res.json({ error: 'Not Found' }, 404)

    assert.strictEqual(res.statusCode, 404)
  })

  test('keeps a status already set by res.status', () => {
    const res = mockRes()
    res.status(404).json({ error: 'Not Found' })

    assert.strictEqual(res.statusCode, 404)
  })

  test('an explicit status overrides res.status', () => {
    const res = mockRes()
    res.status(500).json({ error: 'Not Found' }, 404)

    assert.strictEqual(res.statusCode, 404)
  })
})

describe('res.status', () => {
  test('is chainable', () => {
    const res = mockRes()
    assert.strictEqual(res.status(201), res)
  })
})

describe('res.send', () => {
  test('a string defaults to text/plain, so markup is not rendered', () => {
    const res = mockRes()
    res.send('<script>alert(1)</script>')

    assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8')
    assert.strictEqual(res.body, '<script>alert(1)</script>')
  })

  test('an explicit Content-Type is kept', () => {
    const res = mockRes()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send('<p>hi</p>')

    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8')
  })

  test('an object is still JSON', () => {
    const res = mockRes()
    res.send({ ok: true })

    assert.strictEqual(res.headers['content-type'], 'application/json')
  })
})

describe('errors after the response has started', () => {
  const listen = (app) => new Promise((resolve) => {
    app.server.listen(0, () => resolve(app.server.address().port))
  })

  test('a throw after res.end does not crash or hang the server', async () => {
    const { createServer } = await import('./index.js')
    const app = await createServer({
      autoloadRoutes: false, autoloadMiddleware: false, static: false,
      storage: { driver: false }, cors: false
    })
    app.get('/late', (req, res) => {
      res.json({ ok: true })
      throw new Error('after the fact')
    })

    const error = console.error
    console.error = () => {}

    try {
      const port = await listen(app)
      const response = await fetch(`http://127.0.0.1:${port}/late`)
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(await response.json(), { ok: true })

      // And the server is still answering.
      const again = await fetch(`http://127.0.0.1:${port}/late`)
      assert.strictEqual(again.status, 200)
      await again.text()
    } finally {
      console.error = error
      await new Promise((resolve) => app.server.close(resolve))
    }
  })

  test('an error handler that throws is contained', async () => {
    const app = createApp({ onError: () => { throw new Error('handler broke') } })
    app.get('/boom', () => { throw new Error('boom') })

    const error = console.error
    console.error = () => {}

    try {
      const port = await listen(app)
      const response = await fetch(`http://127.0.0.1:${port}/boom`)
      assert.strictEqual(response.status, 500)
      await response.text()
    } finally {
      console.error = error
      await new Promise((resolve) => app.server.close(resolve))
    }
  })
})
