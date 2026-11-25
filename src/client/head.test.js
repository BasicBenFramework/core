/**
 * Page metadata: what resolveHead decides, what headTags writes, and what
 * applyHead does to a live document. No React needed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { resolveHead, headTags, applyHead, routeHead, NOT_FOUND_HEAD } from './head.js'

const site = { title: 'My Site', titleTemplate: '%s — My Site', description: 'Site description', siteUrl: 'https://example.com/', image: 'https://example.com/card.png' }

describe('resolveHead', () => {
  test('a page title goes through the template; the home page is the site name', () => {
    assert.strictEqual(resolveHead(site, { title: 'About' }, '/about').title, 'About — My Site')
    assert.strictEqual(resolveHead(site, {}, '/').title, 'My Site')
    assert.strictEqual(resolveHead(site, { title: 'Exactly this', fullTitle: true }, '/x').title, 'Exactly this')
    assert.strictEqual(resolveHead({ ...site, titleTemplate: (t) => `${t} | S` }, { title: 'A' }, '/a').title, 'A | S')
  })

  test('canonical is siteUrl plus the path, without a trailing slash or query', () => {
    assert.strictEqual(resolveHead(site, {}, '/docs/?x=1').canonical, 'https://example.com/docs')
    assert.strictEqual(resolveHead(site, {}, '/').canonical, 'https://example.com/')
    assert.strictEqual(resolveHead(site, { canonical: 'https://elsewhere.example/a' }, '/a').canonical, 'https://elsewhere.example/a')
    assert.strictEqual(resolveHead({ title: 'S' }, {}, '/a').canonical, null, 'no siteUrl, no canonical')
  })

  test('defaults fill in, and a page can clear one with null', () => {
    const head = resolveHead(site, { title: 'A' }, '/a')
    assert.strictEqual(head.description, 'Site description')
    assert.strictEqual(head.image, 'https://example.com/card.png')
    assert.strictEqual(resolveHead(site, { description: null }, '/a').description, null)
  })

  test('noindex drops the canonical', () => {
    const head = resolveHead(site, NOT_FOUND_HEAD, '/missing')
    assert.strictEqual(head.noindex, true)
    assert.strictEqual(head.canonical, null)
    assert.strictEqual(head.title, 'Page not found — My Site')
  })

  test('a route head can be a function of the params', () => {
    assert.deepStrictEqual(routeHead({ head: (p) => ({ title: `Post ${p.id}` }) }, { id: '7' }), { title: 'Post 7' })
    assert.strictEqual(routeHead({ head: null }), null)
  })
})

describe('headTags', () => {
  test('writes every tag, escaped', () => {
    const html = headTags(resolveHead(site, { title: 'Tom & "Jerry" <3', description: 'A <b>b</b>', jsonLd: { name: '</script><x>' } }, '/t'))
    assert.match(html, /^<title>Tom &amp; &quot;Jerry&quot; &lt;3 — My Site<\/title>/)
    assert.match(html, /<meta name="description" content="A &lt;b&gt;b&lt;\/b&gt;">/)
    assert.match(html, /<link rel="canonical" href="https:\/\/example.com\/t">/)
    assert.match(html, /<meta property="og:image" content="https:\/\/example.com\/card.png">/)
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/)
    assert.match(html, /<script type="application\/ld\+json" data-head>\{"name":"\\u003c\/script\\u003e\\u003cx\\u003e"\}<\/script>/)
    assert.doesNotMatch(html, /name="robots"/)
  })

  test('noindex writes a robots tag and no canonical or og:url', () => {
    const html = headTags(resolveHead(site, NOT_FOUND_HEAD, '/x'))
    assert.match(html, /<meta name="robots" content="noindex">/)
    assert.doesNotMatch(html, /canonical|og:url/)
  })
})

describe('applyHead', () => {
  test('updates, adds and removes the tags it manages, and leaves others alone', () => {
    const doc = fakeDocument()
    const viewport = doc.head.appendChild(doc.createElement('meta'))
    viewport.setAttribute('name', 'viewport')

    applyHead(resolveHead(site, { title: 'A', jsonLd: { a: 1 } }, '/a'), doc)
    assert.strictEqual(doc.title, 'A — My Site')
    assert.strictEqual(doc.head.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://example.com/a')
    assert.ok(doc.head.querySelector('script[type="application/ld+json"][data-head]'))

    applyHead(resolveHead(site, { title: 'Gone', noindex: true, description: null }, '/b'), doc)
    assert.strictEqual(doc.head.querySelector('link[rel="canonical"]'), null)
    assert.strictEqual(doc.head.querySelector('meta[name="description"]'), null)
    assert.strictEqual(doc.head.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex')
    assert.strictEqual(doc.head.querySelector('script[type="application/ld+json"][data-head]'), null)
    assert.ok(doc.head.children.includes(viewport), 'an unmanaged tag stays')
    assert.strictEqual(doc.head.children.filter((el) => el.tag === 'meta' && el.attrs['property'] === 'og:title').length, 1, 'no duplicates')
  })
})

/** The slice of the DOM applyHead uses: attribute selectors on <head>'s children. */
function fakeDocument() {
  const children = []
  const element = (tag) => ({
    tag,
    attrs: {},
    textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] ?? null },
    remove() { children.splice(children.indexOf(this), 1) }
  })
  const matches = (el, selector) => {
    const [, tag, rest] = selector.match(/^(\w+)(.*)$/)
    if (el.tag !== tag) return false
    for (const [, key, value] of rest.matchAll(/\[([\w:-]+)(?:="([^"]*)")?\]/g)) {
      if (value === undefined ? !(key in el.attrs) : el.attrs[key] !== value) return false
    }
    return true
  }
  return {
    title: '',
    createElement: element,
    head: {
      children,
      appendChild(el) { children.push(el); return el },
      querySelector(selector) { return children.find((el) => matches(el, selector)) ?? null }
    }
  }
}
