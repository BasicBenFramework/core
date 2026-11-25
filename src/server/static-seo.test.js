/**
 * What the static server tells caches, crawlers and browsers: cache policy by
 * file kind, charset, compression, and — after a prerendering build — the
 * prerendered page for a path and a real 404 for a path no route matches.
 *
 * Over a real HTTP server, because compression and streaming are what is
 * being tested.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import http from 'node:http'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'
import { serveStatic, spaFallback } from './static.js'

let root, server, base, originalCwd
const BIG_JS = 'console.log("hello");\n'.repeat(200)

function serve(prerendered) {
  const dir = prerendered ? 'built' : 'plain'
  const statics = serveStatic({ dir })
  const fallback = spaFallback({ dir, spa: true }, (req, res) => { res.statusCode = 404; res.end('api 404') })
  return http.createServer((req, res) => {
    req.path = new URL(req.url, 'http://x').pathname
    statics(req, res, () => fallback(req, res))
  })
}

async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers, redirect: 'manual' })
  const body = Buffer.from(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, body }
}

describe('static files: caching, charset, compression', () => {
  before(async () => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), 'basicben-static-seo-'))
    mkdirSync(join(root, 'plain', 'assets'), { recursive: true })
    writeFileSync(join(root, 'plain', 'index.html'), '<!doctype html><div id="root"></div>')
    writeFileSync(join(root, 'plain', 'assets', 'index-AbCd1234.js'), BIG_JS)
    writeFileSync(join(root, 'plain', 'logo.svg'), '<svg/>')
    process.chdir(root)
    server = serve(false).listen(0)
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(() => {
    server.close()
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  test('HTML, including / itself, is no-cache; hashed assets are immutable for a year', async () => {
    const home = await get('/')
    assert.strictEqual(home.headers.get('cache-control'), 'no-cache')
    assert.strictEqual(home.headers.get('content-type'), 'text/html; charset=utf-8')

    const asset = await get('/assets/index-AbCd1234.js')
    assert.strictEqual(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.strictEqual(asset.headers.get('content-type'), 'application/javascript; charset=utf-8')

    const other = await get('/logo.svg')
    assert.strictEqual(other.headers.get('cache-control'), 'public, max-age=86400')
  })

  test('text of 1 KB and up is compressed for a client that accepts it', async () => {
    const plain = await get('/assets/index-AbCd1234.js', { 'accept-encoding': 'identity' })
    assert.strictEqual(plain.headers.get('content-encoding'), null)
    assert.strictEqual(plain.body.toString(), BIG_JS)

    const gz = await fetch(base + '/assets/index-AbCd1234.js', { headers: { 'accept-encoding': 'gzip' } })
    assert.strictEqual(gz.headers.get('content-encoding'), 'gzip')
    assert.strictEqual(gz.headers.get('vary'), 'Accept-Encoding')
    // fetch decodes gzip itself; what matters is that it round-trips.
    assert.strictEqual(await gz.text(), BIG_JS)

    const raw = await new Promise((resolve) => {
      http.get(base + '/assets/index-AbCd1234.js', { headers: { 'accept-encoding': 'br, gzip' } }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
      })
    })
    assert.strictEqual(raw.encoding, 'br')
    assert.strictEqual(brotliDecompressSync(raw.body).toString(), BIG_JS)
    assert.ok(raw.body.length < BIG_JS.length / 4)
  })

  test('a refused encoding (q=0) and a range request are sent uncompressed', async () => {
    const refused = await new Promise((resolve) => {
      http.get(base + '/assets/index-AbCd1234.js', { headers: { 'accept-encoding': 'br;q=0, gzip' } }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
      })
    })
    assert.strictEqual(refused.encoding, 'gzip')
    assert.strictEqual(gunzipSync(refused.body).toString(), BIG_JS)

    const ranged = await get('/assets/index-AbCd1234.js', { 'accept-encoding': 'gzip', range: 'bytes=0-9' })
    assert.strictEqual(ranged.status, 206)
    assert.strictEqual(ranged.headers.get('content-encoding'), null)
    assert.strictEqual(ranged.body.toString(), BIG_JS.slice(0, 10))
  })

  test('without a prerendering build, unmatched paths still get the shell with 200', async () => {
    const res = await get('/anything/at/all')
    assert.strictEqual(res.status, 200)
    assert.match(res.body.toString(), /id="root"/)
  })
})

describe('after a prerendering build', () => {
  before(async () => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), 'basicben-static-seo-'))
    const dir = join(root, 'built')
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, '.basicben'), { recursive: true })
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Home</title><h1>Home</h1>')
    writeFileSync(join(dir, 'docs.html'), '<!doctype html><title>Docs</title>')
    writeFileSync(join(dir, 'docs', 'routing.html'), '<!doctype html><title>Routing</title>')
    writeFileSync(join(dir, '404.html'), '<!doctype html><title>Not found</title>')
    writeFileSync(join(dir, '.basicben', 'shell.html'), '<!doctype html><div id="root"></div>')
    writeFileSync(join(dir, '.basicben', 'routes.json'), JSON.stringify({ routes: ['/', '/docs', '/docs/routing', '/posts/:id'] }))
    process.chdir(root)
    server = serve(true).listen(0)
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(() => {
    server.close()
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  test('a prerendered path gets its own page', async () => {
    assert.match((await get('/docs/routing')).body.toString(), /<title>Routing/)
    assert.match((await get('/docs')).body.toString(), /<title>Docs/)
    assert.match((await get('/docs/')).body.toString(), /<title>Docs/)
    assert.match((await get('/')).body.toString(), /<title>Home/)
  })

  test('a client route that was not prerendered gets the clean shell, not the home page', async () => {
    const res = await get('/posts/42')
    assert.strictEqual(res.status, 200)
    assert.match(res.body.toString(), /id="root"/)
    assert.doesNotMatch(res.body.toString(), /Home/)
  })

  test('a path no client route matches is a real 404, with 404.html', async () => {
    const res = await get('/no/such/page')
    assert.strictEqual(res.status, 404)
    assert.match(res.body.toString(), /Not found/)
    assert.strictEqual(res.headers.get('cache-control'), 'no-cache')
  })

  test('the build directory is never served', async () => {
    assert.strictEqual((await get('/.basicben/routes.json')).status, 404)
    assert.strictEqual((await get('/.basicben/shell')).status, 404)
  })
})
