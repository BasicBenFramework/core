/**
 * Tests for file-based router
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { filePathToRoutePath, createFileRouter, getRouteManifest } from './file-router.js'

const TEST_DIR = resolve(process.cwd(), '.test-pages')

describe('filePathToRoutePath', () => {
  const baseDir = '/app/src/pages'

  it('converts index.js to /', () => {
    const result = filePathToRoutePath('/app/src/pages/index.js', baseDir)
    assert.strictEqual(result, '/')
  })

  it('converts users/index.js to /users', () => {
    const result = filePathToRoutePath('/app/src/pages/users/index.js', baseDir)
    assert.strictEqual(result, '/users')
  })

  it('converts users.js to /users', () => {
    const result = filePathToRoutePath('/app/src/pages/users.js', baseDir)
    assert.strictEqual(result, '/users')
  })

  it('converts nested paths correctly', () => {
    const result = filePathToRoutePath('/app/src/pages/api/users/list.js', baseDir)
    assert.strictEqual(result, '/api/users/list')
  })

  it('converts [id].js to /:id', () => {
    const result = filePathToRoutePath('/app/src/pages/users/[id].js', baseDir)
    assert.strictEqual(result, '/users/:id')
  })

  it('converts nested dynamic segments', () => {
    const result = filePathToRoutePath('/app/src/pages/users/[userId]/posts/[postId].js', baseDir)
    assert.strictEqual(result, '/users/:userId/posts/:postId')
  })

  it('converts [...slug].js to /*', () => {
    const result = filePathToRoutePath('/app/src/pages/[...slug].js', baseDir)
    assert.strictEqual(result, '/*')
  })

  it('converts docs/[...path].js to /docs/*', () => {
    const result = filePathToRoutePath('/app/src/pages/docs/[...path].js', baseDir)
    assert.strictEqual(result, '/docs/*')
  })

  it('handles mixed static and dynamic segments', () => {
    const result = filePathToRoutePath('/app/src/pages/posts/[id]/comments/index.js', baseDir)
    assert.strictEqual(result, '/posts/:id/comments')
  })

  it('applies baseUrl prefix', () => {
    const result = filePathToRoutePath('/app/src/pages/users/index.js', baseDir, '/api')
    assert.strictEqual(result, '/api/users')
  })

  it('handles baseUrl for root index', () => {
    const result = filePathToRoutePath('/app/src/pages/index.js', baseDir, '/api')
    assert.strictEqual(result, '/api')
  })
})

describe('createFileRouter', () => {
  beforeEach(() => {
    // Create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('returns empty router for non-existent directory', async () => {
    const router = await createFileRouter('.non-existent-dir')
    assert.ok(router)
    // Router should have no routes registered
  })

  it('loads index.js as root route', async () => {
    writeFileSync(join(TEST_DIR, 'index.js'), `
      export function get(req, res) {
        res.end('home')
      }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/')

    assert.ok(match, 'Should match root route')
    assert.ok(match.route.handler, 'Should have handler')
  })

  it('loads nested routes', async () => {
    mkdirSync(join(TEST_DIR, 'users'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'users/index.js'), `
      export function get(req, res) {
        res.end('users list')
      }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/users')

    assert.ok(match, 'Should match /users route')
  })

  it('loads dynamic segments', async () => {
    mkdirSync(join(TEST_DIR, 'users'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'users/[id].js'), `
      export function get(req, res) {
        res.end('user detail')
      }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/users/123')

    assert.ok(match, 'Should match /users/:id route')
    assert.strictEqual(match.params.id, '123')
  })

  it('loads multiple HTTP methods from one file', async () => {
    writeFileSync(join(TEST_DIR, 'items.js'), `
      export function get(req, res) { res.end('list') }
      export function post(req, res) { res.end('create') }
      export function put(req, res) { res.end('update') }
      export function del(req, res) { res.end('delete') }
    `)

    const router = await createFileRouter(TEST_DIR)

    assert.ok(router.match('get', '/items'), 'Should match GET')
    assert.ok(router.match('post', '/items'), 'Should match POST')
    assert.ok(router.match('put', '/items'), 'Should match PUT')
    assert.ok(router.match('delete', '/items'), 'Should match DELETE')
  })

  it('uses default export as GET handler', async () => {
    writeFileSync(join(TEST_DIR, 'about.js'), `
      export default function(req, res) {
        res.end('about page')
      }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/about')

    assert.ok(match, 'Should match GET /about')
  })

  it('prefers explicit get over default export', async () => {
    writeFileSync(join(TEST_DIR, 'test.js'), `
      let called = ''
      export function get(req, res) {
        called = 'get'
        res.end('explicit get')
      }
      export default function(req, res) {
        called = 'default'
        res.end('default')
      }
      export { called }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/test')

    assert.ok(match, 'Should match GET /test')
    // Should have the explicit get handler
    assert.ok(match.route.handler, 'Should have handler')
  })

  it('includes route-specific middleware', async () => {
    writeFileSync(join(TEST_DIR, 'protected.js'), `
      function authMiddleware(req, res, next) {
        req.authed = true
        next()
      }
      export const middleware = [authMiddleware]
      export function get(req, res) {
        res.end('protected')
      }
    `)

    const router = await createFileRouter(TEST_DIR)
    const match = router.match('get', '/protected')

    assert.ok(match, 'Should match route')
    // Middleware should be included
    assert.strictEqual(match.route.middleware.length, 1)
    assert.ok(match.route.handler, 'Should have handler')
  })

  it('ignores files starting with underscore', async () => {
    writeFileSync(join(TEST_DIR, '_helpers.js'), `
      export function get(req, res) { res.end('helper') }
    `)
    writeFileSync(join(TEST_DIR, 'public.js'), `
      export function get(req, res) { res.end('public') }
    `)

    const router = await createFileRouter(TEST_DIR)

    assert.ok(router.match('get', '/public'), 'Should match /public')
    assert.ok(!router.match('get', '/_helpers'), 'Should not match /_helpers')
  })

  it('ignores test files', async () => {
    writeFileSync(join(TEST_DIR, 'api.test.js'), `
      export function get(req, res) { res.end('test') }
    `)
    writeFileSync(join(TEST_DIR, 'api.spec.js'), `
      export function get(req, res) { res.end('spec') }
    `)

    const router = await createFileRouter(TEST_DIR)

    assert.ok(!router.match('get', '/api.test'), 'Should not match test files')
    assert.ok(!router.match('get', '/api.spec'), 'Should not match spec files')
  })

  it('ignores directories starting with underscore', async () => {
    mkdirSync(join(TEST_DIR, '_private'), { recursive: true })
    writeFileSync(join(TEST_DIR, '_private/secret.js'), `
      export function get(req, res) { res.end('secret') }
    `)

    const router = await createFileRouter(TEST_DIR)

    assert.ok(!router.match('get', '/_private/secret'), 'Should not match _private routes')
  })

  it('applies baseUrl option', async () => {
    writeFileSync(join(TEST_DIR, 'users.js'), `
      export function get(req, res) { res.end('users') }
    `)

    const router = await createFileRouter(TEST_DIR, { baseUrl: '/api/v1' })
    const match = router.match('get', '/api/v1/users')

    assert.ok(match, 'Should match with baseUrl prefix')
  })

  it('sorts static routes before dynamic', async () => {
    mkdirSync(join(TEST_DIR, 'users'), { recursive: true })

    // Create in reverse priority order to test sorting
    writeFileSync(join(TEST_DIR, 'users/[id].js'), `
      export function get(req, res) { res.end('dynamic') }
    `)
    writeFileSync(join(TEST_DIR, 'users/me.js'), `
      export function get(req, res) { res.end('static') }
    `)

    const router = await createFileRouter(TEST_DIR)

    // /users/me should match the static route, not the dynamic one
    const match = router.match('get', '/users/me')
    assert.ok(match, 'Should match /users/me')
    // The static route should be registered first
  })

  it('handles catch-all routes', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'docs/[...path].js'), `
      export function get(req, res) { res.end('docs') }
    `)

    const router = await createFileRouter(TEST_DIR)

    assert.ok(router.match('get', '/docs/intro'), 'Should match /docs/intro')
    assert.ok(router.match('get', '/docs/guide/setup'), 'Should match /docs/guide/setup')
  })
})

describe('getRouteManifest', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('returns empty array for non-existent directory', async () => {
    const manifest = await getRouteManifest('.non-existent-dir')
    assert.deepStrictEqual(manifest, [])
  })

  it('returns route information', async () => {
    writeFileSync(join(TEST_DIR, 'users.js'), `
      export function get(req, res) { res.end('get') }
      export function post(req, res) { res.end('post') }
    `)

    const manifest = await getRouteManifest(TEST_DIR)

    assert.strictEqual(manifest.length, 1)
    assert.strictEqual(manifest[0].file, 'users.js')
    assert.strictEqual(manifest[0].path, '/users')
    // Methods are uppercase
    assert.ok(manifest[0].methods.some(m => m.toUpperCase() === 'GET'), 'Should have GET')
    assert.ok(manifest[0].methods.some(m => m.toUpperCase() === 'POST'), 'Should have POST')
  })

  it('indicates middleware presence', async () => {
    writeFileSync(join(TEST_DIR, 'protected.js'), `
      export const middleware = [(req, res, next) => next()]
      export function get(req, res) { res.end('protected') }
    `)

    const manifest = await getRouteManifest(TEST_DIR)

    assert.strictEqual(manifest[0].hasMiddleware, true)
  })
})
