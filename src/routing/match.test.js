/**
 * The shared route matcher.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { compileRoute, normalizePath, parseQuery } from './match.js'

describe('normalizePath', () => {
  test('adds a leading slash and drops trailing ones', () => {
    assert.strictEqual(normalizePath(''), '/')
    assert.strictEqual(normalizePath('/'), '/')
    assert.strictEqual(normalizePath('about'), '/about')
    assert.strictEqual(normalizePath('/about/'), '/about')
    assert.strictEqual(normalizePath('/about//'), '/about')
    assert.strictEqual(normalizePath('//'), '/')
  })
})

describe('compileRoute', () => {
  test('a trailing slash matches either way round', () => {
    assert.deepStrictEqual(compileRoute('/about').match('/about/'), {})
    assert.deepStrictEqual(compileRoute('/about/').match('/about'), {})
    assert.deepStrictEqual(compileRoute('/').match('/'), {})
    assert.strictEqual(compileRoute('/').match('/x'), null)
  })

  test('literal segments are literal: the . in feed.xml matches only a dot', () => {
    const feed = compileRoute('/feed.xml')
    assert.deepStrictEqual(feed.match('/feed.xml'), {})
    assert.strictEqual(feed.match('/feedXxml'), null)
    assert.strictEqual(feed.match('/feed-xml'), null)

    for (const literal of ['/a+b', '/(x)', '/a|b', '/a$', '/[ab]', '/a{2}', '/a^b', '/a b']) {
      const route = compileRoute(literal)
      // As a request would carry it.
      const pathname = new URL('http://x' + literal).pathname
      assert.deepStrictEqual(route.match(pathname), {}, literal)
    }
    assert.strictEqual(compileRoute('/a+b').match('/aab'), null)
    assert.strictEqual(compileRoute('/a|b').match('/b'), null)
  })

  test('params are URI-decoded', () => {
    const route = compileRoute('/tags/:tag')
    assert.deepStrictEqual(route.match('/tags/caf%C3%A9'), { tag: 'café' })
    assert.deepStrictEqual(route.match('/tags/a%20b'), { tag: 'a b' })
    // An encoded slash or backslash stays encoded: a param is never a path.
    assert.deepStrictEqual(route.match('/tags/a%2Fb'), { tag: 'a%2Fb' })
    assert.deepStrictEqual(route.match('/tags/a%2fb%5cc%20d'), { tag: 'a%2Fb%5Cc d' })
    assert.strictEqual(route.match('/tags/a/b'), null)
  })

  test('a malformed escape is a 400, not a 500 or a silent mismatch', () => {
    assert.throws(() => compileRoute('/tags/:tag').match('/tags/%E0%A4%A'), (err) => err.statusCode === 400)
  })

  test('a param can share a segment with a literal', () => {
    const route = compileRoute('/feed/:name.xml')
    assert.deepStrictEqual(route.match('/feed/news.xml'), { name: 'news' })
    assert.strictEqual(route.match('/feed/news.json'), null)
  })

  test('several params, in order', () => {
    const route = compileRoute('/users/:userId/posts/:postId')
    assert.deepStrictEqual(route.keys, ['userId', 'postId'])
    assert.deepStrictEqual(route.match('/users/1/posts/2/'), { userId: '1', postId: '2' })
  })

  test('a trailing * catches the rest, including nothing, and decodes it', () => {
    const route = compileRoute('/files/*')
    assert.deepStrictEqual(route.match('/files/a/b%20c.txt'), { _catchAll: 'a/b c.txt' })
    assert.deepStrictEqual(route.match('/files/..%2F..%2Fetc%2Fpasswd'), { _catchAll: '..%2F..%2Fetc%2Fpasswd' })
    assert.deepStrictEqual(route.match('/files'), { _catchAll: '' })
    assert.deepStrictEqual(route.match('/files/'), { _catchAll: '' })
    assert.strictEqual(route.match('/filesystem'), null)
    assert.deepStrictEqual(compileRoute('/*').match('/anything/at/all'), { _catchAll: 'anything/at/all' })
  })

  test('no request gives a param or catch-all a .. segment or a separator it did not have', () => {
    const files = compileRoute('/files/*')
    const one = compileRoute('/p/:id')
    for (const attack of ['/files/..%2F..%2Fetc%2Fpasswd', '/files/%2e%2e/%2e%2e/etc/passwd', '/files/..%5C..%5Cwin.ini', '/files/a/../../etc']) {
      const pathname = new URL('http://x' + attack).pathname
      const params = files.match(pathname)
      if (params) assert.ok(!params._catchAll.split('/').includes('..'), `${attack} -> ${params._catchAll}`)
      assert.ok(!params?._catchAll.includes('\\'), attack)
    }
    for (const attack of ['/p/..%2Fsecret', '/p/a%5Cb', '/p/%2e%2e']) {
      const params = one.match(new URL('http://x' + attack).pathname)
      if (params) assert.ok(!/[\/\\]/.test(params.id) && params.id !== '..', `${attack} -> ${params.id}`)
    }
  })

  test('* alone matches every path', () => {
    assert.deepStrictEqual(compileRoute('*').match('/whatever/here'), {})
  })

  test('a non-ASCII literal matches the percent-encoded pathname a request carries', () => {
    const pathname = new URL('http://x/café').pathname
    assert.deepStrictEqual(compileRoute('/café').match(pathname), {})
  })

  test('matching is case-sensitive', () => {
    assert.strictEqual(compileRoute('/About').match('/about'), null)
  })
})

describe('parseQuery', () => {
  test('keeps repeated keys as an array, single keys as a string', () => {
    const query = parseQuery(new URLSearchParams('tag=a&tag=b&q=x&empty='))
    assert.deepStrictEqual({ ...query }, { tag: ['a', 'b'], q: 'x', empty: '' })
  })

  test('a __proto__ key is data, not a prototype', () => {
    const query = parseQuery(new URLSearchParams('__proto__=x&polluted=1'))
    assert.strictEqual(Object.getPrototypeOf(query), Object.prototype)
    assert.strictEqual(Object.getOwnPropertyDescriptor(query, '__proto__').value, 'x')
    assert.strictEqual(({}).polluted, undefined)
  })
})
