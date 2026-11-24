/**
 * The HTTP app's request matching, served for real.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import { request } from 'node:http'
import { createApp } from './http.js'
import { Router } from './router.js'

function send(res, body, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** A raw request, so a HEAD response's bytes can be counted. */
function raw(port, method, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('createApp routing', () => {
  let app
  let port
  const seen = []

  before(async () => {
    app = createApp()
    app.get('/feed.xml', (req, res) => send(res, { route: 'feed' }))
    app.get('/tags/:tag', (req, res) => send(res, { tag: req.params.tag }))
    app.get('/search', (req, res) => send(res, { query: req.query }))
    app.get('/about', (req, res) => { seen.push(req.method); send(res, { route: 'about' }) })
    app.head('/own-head', (req, res) => { res.setHeader('X-Head', 'own'); res.end() })
    app.get('/own-head', (req, res) => send(res, { route: 'get' }))

    // Through the Router, as loaded route files register.
    const router = new Router()
    router.get('/posts/:slug/', (req, res) => send(res, { slug: req.params.slug }))
    router.applyTo(app)

    await new Promise((resolve) => app.listen(0, resolve))
    port = app.server.address().port
  })

  after(() => new Promise((resolve) => app.close(resolve)))

  test('a trailing slash on the request matches', async () => {
    const res = await raw(port, 'GET', '/about/')
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(JSON.parse(res.body), { route: 'about' })
  })

  test('a trailing slash on the registered route matches too', async () => {
    const res = await raw(port, 'GET', '/posts/hello')
    assert.deepStrictEqual(JSON.parse(res.body), { slug: 'hello' })
  })

  test('the . in /feed.xml is literal', async () => {
    assert.strictEqual((await raw(port, 'GET', '/feed.xml')).status, 200)
    assert.strictEqual((await raw(port, 'GET', '/feedXxml')).status, 404)
  })

  test('params arrive decoded', async () => {
    const res = await raw(port, 'GET', '/tags/caf%C3%A9%20au%20lait')
    assert.deepStrictEqual(JSON.parse(res.body), { tag: 'café au lait' })
  })

  test('a malformed escape in a param is a 400', async () => {
    const res = await raw(port, 'GET', '/tags/%E0%A4%A')
    assert.strictEqual(res.status, 400)
  })

  test('repeated query keys are kept', async () => {
    const res = await raw(port, 'GET', '/search?tag=a&tag=b&q=x')
    assert.deepStrictEqual(JSON.parse(res.body), { query: { tag: ['a', 'b'], q: 'x' } })
  })

  test('HEAD runs the GET route and sends headers without a body', async () => {
    seen.length = 0
    const res = await raw(port, 'HEAD', '/about')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.headers['content-type'], 'application/json')
    assert.strictEqual(res.body, '')
    assert.deepStrictEqual(seen, ['HEAD'])
  })

  test('a HEAD route of its own wins over the GET fallback', async () => {
    const res = await raw(port, 'HEAD', '/own-head')
    assert.strictEqual(res.headers['x-head'], 'own')
  })

  test('HEAD on a path with no GET route is still a 404', async () => {
    assert.strictEqual((await raw(port, 'HEAD', '/nowhere')).status, 404)
  })

  test('other methods do not fall back to GET', async () => {
    assert.strictEqual((await raw(port, 'POST', '/about')).status, 404)
  })
})

describe('Router.match and Router.route', () => {
  test('match uses the same rules, HEAD fallback included', () => {
    const router = new Router()
    router.get('/feed.xml', () => {})
    router.get('/tags/:tag', 'tags.show', () => {})
    assert.ok(router.match('GET', '/feed.xml/'))
    assert.strictEqual(router.match('GET', '/feedXxml'), null)
    assert.deepStrictEqual(router.match('HEAD', '/tags/a%20b').params, { tag: 'a b' })
  })

  test('route() encodes values so they round-trip', () => {
    const router = new Router()
    router.get('/tags/:tag', 'tags.show', () => {})
    const url = router.route('tags.show', { tag: 'a/b c' })
    assert.strictEqual(url, '/tags/a%2Fb%20c')
    assert.deepStrictEqual(router.match('GET', url).params, { tag: 'a/b c' })
  })
})
