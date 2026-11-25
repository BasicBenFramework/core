/**
 * trailingSlash: 'redirect' — one URL per page. `/about/` is a 301 to
 * `/about`, the query kept; other methods, `/` and `//` are left alone.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { redirectTrailingSlash } from './index.js'

function run(method, url) {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end() { this.ended = true } }
  let passed = false
  redirectTrailingSlash({ method, url, path: url.split('?')[0] }, res, () => { passed = true })
  return { res, passed }
}

test('a GET or HEAD with a trailing slash is a 301 to the bare path, query kept', () => {
  const { res } = run('GET', '/docs/routing/?a=1&b=2')
  assert.strictEqual(res.statusCode, 301)
  assert.strictEqual(res.headers.location, '/docs/routing?a=1&b=2')
  assert.strictEqual(run('HEAD', '/about//').res.headers.location, '/about')
})

test('/, //, other methods and bare paths pass through', () => {
  assert.ok(run('GET', '/').passed)
  assert.ok(run('GET', '//evil.example/').passed)
  assert.ok(run('POST', '/form/').passed)
  assert.ok(run('GET', '/about').passed)
})
