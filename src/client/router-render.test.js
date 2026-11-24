/**
 * createClientApp, Link and useSearchParams, rendered with react-dom/server.
 *
 * Skipped when React is not installed: CI's test job runs on a bare checkout,
 * since the framework has no runtime dependencies. `npm ci` first to run
 * these.
 */

import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert'

let React, renderToString, client
try {
  React = await import('react')
  ;({ renderToString } = await import('react-dom/server'))
  client = await import('./index.js')
} catch {
  // left undefined; the suite skips
}

const skip = !renderToString && 'react and react-dom are not installed'

/** Just enough of a browser for the router: a location and a history. */
function fakeBrowser(href, { token = null } = {}) {
  const calls = []
  const url = new URL(href)
  const location = {
    get href() { return url.href },
    get origin() { return url.origin },
    get pathname() { return url.pathname },
    get search() { return url.search },
    get hash() { return url.hash },
    assign: (to) => calls.push(['assign', to])
  }
  globalThis.window = {
    location,
    history: {
      pushState: (_s, _t, to) => calls.push(['pushState', to]),
      replaceState: (_s, _t, to) => calls.push(['replaceState', to])
    },
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {}
  }
  const store = new Map(token ? [['token', token]] : [])
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  }
  globalThis.fetch = async (...args) => { calls.push(['fetch', ...args]); return { ok: false } }
  return calls
}

describe('client router, rendered', { skip }, () => {
  let h
  before(() => { h = React.createElement })

  test('a URL with a query string renders its route, not NotFound', () => {
    fakeBrowser('https://app.test/x?y=1')
    const X = () => h('p', null, 'x page')
    const App = client.createClientApp({ routes: { '/x': X }, NotFound: () => h('p', null, 'missing') })
    assert.match(renderToString(h(App)), /x page/)
  })

  test('an auth route does not navigate during render', () => {
    const calls = fakeBrowser('https://app.test/secret')
    const App = client.createClientApp({ routes: { '/secret': { component: () => h('p', null, 'secret'), auth: true } } })
    const html = renderToString(h(App))
    assert.doesNotMatch(html, /secret/)
    assert.deepStrictEqual(calls.filter(c => c[0] !== 'fetch'), [], 'no history change while rendering')
  })

  test('signed out, the first render is the page rather than Loading', () => {
    fakeBrowser('https://app.test/')
    const App = client.createClientApp({ routes: { '/': () => h('p', null, 'home') }, Loading: () => h('p', null, 'loading') })
    assert.match(renderToString(h(App)), /home/)
  })

  test('with a token it waits for the configured auth endpoint', () => {
    fakeBrowser('https://app.test/', { token: 't' })
    const seen = []
    const App = client.createClientApp({
      routes: { '/': () => h('p', null, 'home') },
      Loading: () => h('p', null, 'loading'),
      authEndpoint: '/api/me',
      api: async (path) => { seen.push(path); return { user: null } }
    })
    assert.match(renderToString(h(App)), /loading/)
  })

  test('authEndpoint: false skips the check even with a token', () => {
    fakeBrowser('https://app.test/', { token: 't' })
    const App = client.createClientApp({ routes: { '/': () => h('p', null, 'home') }, authEndpoint: false })
    assert.match(renderToString(h(App)), /home/)
  })

  test('Link renders a real anchor and navigates on a plain click', () => {
    const calls = fakeBrowser('https://app.test/')
    let anchor
    const Page = () => {
      anchor = client.Link({ to: '/posts?page=2', className: 'nav', children: 'Posts' })
      return anchor
    }
    const App = client.createClientApp({ routes: { '/': Page } })
    const html = renderToString(h(App))
    assert.match(html, /<a class="nav" href="\/posts\?page=2">Posts<\/a>/)

    let prevented = false
    anchor.props.onClick({ button: 0, preventDefault: () => { prevented = true }, currentTarget: { href: 'https://app.test/posts?page=2' } })
    assert.strictEqual(prevented, true)
    assert.deepStrictEqual(calls.find(c => c[0] === 'pushState'), ['pushState', '/posts?page=2'])

    prevented = false
    anchor.props.onClick({ button: 0, metaKey: true, preventDefault: () => { prevented = true }, currentTarget: { href: 'https://app.test/posts?page=2' } })
    assert.strictEqual(prevented, false, 'cmd-click opens a tab as usual')
  })

  test('useSearchParams reads the query and its setter keeps the path', () => {
    const calls = fakeBrowser('https://app.test/posts?page=2&tag=a&tag=b')
    let params, setParams
    const Page = () => {
      ;[params, setParams] = client.useSearchParams()
      return h('p', null, params.get('page'))
    }
    const App = client.createClientApp({ routes: { '/posts': Page } })
    assert.match(renderToString(h(App)), /<p>2<\/p>/)
    assert.deepStrictEqual(params.getAll('tag'), ['a', 'b'])

    setParams(p => { p.set('page', '3'); return p })
    assert.deepStrictEqual(calls.find(c => c[0] === 'pushState'), ['pushState', '/posts?page=3&tag=a&tag=b'])

    setParams({ q: 'x' }, { replace: true })
    assert.deepStrictEqual(calls.find(c => c[0] === 'replaceState'), ['replaceState', '/posts?q=x'])
  })
})
