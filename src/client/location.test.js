/**
 * The client router's logic. No React needed, so these run in CI's bare
 * checkout; router-render.test.js renders the real components when React is
 * installed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { resolveLocation, locationPath, createMatcher, guardRedirect, shouldHandleClick, nextSearch } from './location.js'

const BASE = 'https://app.test/posts/1?x=1'

describe('resolveLocation', () => {
  test('separates the query string and hash from the path', () => {
    const loc = resolveLocation('/x?y=1#top', BASE)
    assert.strictEqual(loc.pathname, '/x')
    assert.strictEqual(loc.search, '?y=1')
    assert.strictEqual(loc.hash, '#top')
    assert.strictEqual(locationPath(loc), '/x?y=1#top')
  })

  test('resolves relative paths and notices other origins', () => {
    assert.strictEqual(resolveLocation('2', BASE).pathname, '/posts/2')
    assert.strictEqual(resolveLocation('?page=2', BASE).pathname, '/posts/1')
    assert.strictEqual(resolveLocation('https://elsewhere.test/a', BASE).origin, 'https://elsewhere.test')
  })
})

describe('createMatcher', () => {
  const match = createMatcher([
    { path: '/' },
    { path: '/x' },
    { path: '/posts/:id' },
    { path: '/feed.xml' },
    { path: '*' }
  ])

  test("navigate('/x?y=1') matches /x", () => {
    assert.strictEqual(match(resolveLocation('/x?y=1', BASE).pathname).route.path, '/x')
  })

  test('uses the server rules: trailing slash, literal dot, decoded params', () => {
    assert.strictEqual(match('/x/').route.path, '/x')
    assert.strictEqual(match('/feedXxml').route.path, '*')
    assert.deepStrictEqual(match('/posts/a%20b').params, { id: 'a b' })
  })

  test('a malformed escape matches nothing rather than throwing', () => {
    assert.strictEqual(createMatcher([{ path: '/posts/:id' }])('/posts/%E0%A4%A'), null)
  })

  test('first match in table order', () => {
    assert.strictEqual(match('/').route.path, '/')
  })
})

describe('guardRedirect', () => {
  const paths = { loginPath: '/login', homePath: '/' }
  test('auth routes send signed-out visitors to login; guest routes send users home', () => {
    assert.strictEqual(guardRedirect({ auth: true }, null, paths), '/login')
    assert.strictEqual(guardRedirect({ auth: true }, { id: 1 }, paths), null)
    assert.strictEqual(guardRedirect({ guest: true }, { id: 1 }, paths), '/')
    assert.strictEqual(guardRedirect({ guest: true }, null, paths), null)
    assert.strictEqual(guardRedirect({}, null, { loginPath: '/signin', homePath: '/' }), null)
    assert.strictEqual(guardRedirect({ auth: true }, null, { loginPath: '/signin', homePath: '/' }), '/signin')
  })
})

describe('shouldHandleClick', () => {
  const same = { origin: 'https://app.test', currentOrigin: 'https://app.test' }
  test('a plain left click on a same-origin link', () => {
    assert.strictEqual(shouldHandleClick({ button: 0 }, same), true)
  })
  test('leaves everything else to the browser', () => {
    for (const mod of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      assert.strictEqual(shouldHandleClick({ button: 0, [mod]: true }, same), false, mod)
    }
    assert.strictEqual(shouldHandleClick({ button: 1 }, same), false)
    assert.strictEqual(shouldHandleClick({ button: 0, defaultPrevented: true }, same), false)
    assert.strictEqual(shouldHandleClick({ button: 0 }, { ...same, target: '_blank' }), false)
    assert.strictEqual(shouldHandleClick({ button: 0 }, { ...same, target: '_self' }), true)
    assert.strictEqual(shouldHandleClick({ button: 0 }, { ...same, download: '' }), false)
    assert.strictEqual(shouldHandleClick({ button: 0 }, { origin: 'https://elsewhere.test', currentOrigin: 'https://app.test' }), false)
  })
})

describe('nextSearch', () => {
  const prev = new URLSearchParams('a=1&b=2')
  test('from an object, dropping null and repeating arrays', () => {
    assert.strictEqual(nextSearch({ q: 'x y', tag: ['a', 'b'], gone: null, page: 2 }, prev), '?q=x+y&tag=a&tag=b&page=2')
  })
  test('from a function of the current params, which it may mutate', () => {
    assert.strictEqual(nextSearch(p => { p.set('a', '9'); p.delete('b'); return p }, prev), '?a=9')
    assert.strictEqual(prev.get('b'), '2', 'the original is untouched')
  })
  test('from a string or URLSearchParams; empty is no query at all', () => {
    assert.strictEqual(nextSearch('?z=1', prev), '?z=1')
    assert.strictEqual(nextSearch(new URLSearchParams('z=2'), prev), '?z=2')
    assert.strictEqual(nextSearch({}, prev), '')
  })
})
