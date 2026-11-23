/**
 * Tests for the default security headers
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { securityHeaders } from './security-headers.js'
import { assertAppKey } from './app-key.js'

function run(middleware) {
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v }
  }
  let called = false
  middleware({}, res, () => { called = true })
  assert.ok(called, 'next() was not called')
  return res.headers
}

describe('securityHeaders', () => {
  test('sets the defaults', () => {
    const headers = run(securityHeaders({ production: false }))

    assert.strictEqual(headers['x-content-type-options'], 'nosniff')
    assert.strictEqual(headers['referrer-policy'], 'strict-origin-when-cross-origin')
    assert.strictEqual(headers['x-frame-options'], 'DENY')
    assert.strictEqual(headers['content-security-policy'], "frame-ancestors 'none'")
    assert.strictEqual(headers['strict-transport-security'], undefined)
  })

  test('sends HSTS only in production', () => {
    const headers = run(securityHeaders({ production: true }))
    assert.match(headers['strict-transport-security'], /max-age=\d+/)
  })

  test('a value can be overridden or switched off', () => {
    const headers = run(securityHeaders({ frameOptions: 'SAMEORIGIN', contentSecurityPolicy: false, production: false }))

    assert.strictEqual(headers['x-frame-options'], 'SAMEORIGIN')
    assert.strictEqual(headers['content-security-policy'], undefined)
    assert.strictEqual(headers['x-content-type-options'], 'nosniff')
  })
})

describe('createServer security headers', () => {
  const quiet = { autoloadRoutes: false, autoloadMiddleware: false, static: false, storage: { driver: false }, cors: false }

  const fetchOnce = async (options) => {
    const { createServer } = await import('./index.js')
    const app = await createServer({ ...quiet, ...options })
    app.get('/ok', (req, res) => res.json({ ok: true }))

    await new Promise((resolve) => app.server.listen(0, resolve))
    try {
      const response = await fetch(`http://127.0.0.1:${app.server.address().port}/ok`)
      await response.text()
      return response.headers
    } finally {
      await new Promise((resolve) => app.server.close(resolve))
    }
  }

  test('are on by default', async () => {
    const headers = await fetchOnce({})
    assert.strictEqual(headers.get('x-content-type-options'), 'nosniff')
    assert.strictEqual(headers.get('x-frame-options'), 'DENY')
  })

  test('securityHeaders: false turns them off', async () => {
    const headers = await fetchOnce({ securityHeaders: false })
    assert.strictEqual(headers.get('x-frame-options'), null)
  })
})

describe('assertAppKey', () => {
  test('does nothing outside production', () => {
    assert.doesNotThrow(() => assertAppKey({ NODE_ENV: 'development' }))
  })

  test('refuses a missing key in production', () => {
    assert.throws(() => assertAppKey({ NODE_ENV: 'production' }), /APP_KEY is not set/)
  })

  test('refuses a short key in production', () => {
    assert.throws(() => assertAppKey({ NODE_ENV: 'production', APP_KEY: 'short' }), /at least 32/)
  })

  test('accepts a 32-character key', () => {
    assert.doesNotThrow(() => assertAppKey({ NODE_ENV: 'production', APP_KEY: 'x'.repeat(32) }))
  })
})
