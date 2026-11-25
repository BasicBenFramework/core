/**
 * The prerender, run for real: a small app's routes rendered through the
 * project's Vite and React into per-page HTML with head tags, a 404 page, the
 * clean shell, the route list and a sitemap.
 *
 * Skipped when Vite or React is not installed (CI's bare-checkout job).
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

let available = true
try {
  await import('vite')
  await import('react-dom/server')
} catch {
  available = false
}

describe('prerender', { skip: !available && 'vite and react are not installed' }, () => {
  let app, out, prerender

  before(async () => {
    ;({ prerender } = await import('./prerender.js'))
    // Inside the repository, so the app resolves the framework's React.
    app = mkdtempSync(join(ROOT, '.prerender-test-'))
    out = join(app, 'dist/client')
    mkdirSync(join(app, 'src/routes'), { recursive: true })
    mkdirSync(out, { recursive: true })
    writeFileSync(join(app, 'package.json'), '{ "type": "module" }')
    writeFileSync(join(out, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"><meta name="description" content="template"><title>Template</title></head>' +
      '<body><div id="root"></div><script type="module" src="/assets/app-1234abcd.js"></script></body></html>')
    writeFileSync(join(app, 'src/routes/App.js'), `
      import { createElement as h } from 'react'
      import { createClientApp } from ${JSON.stringify(join(ROOT, 'src/client/index.js'))}
      const Page = (text) => () => h('main', null, h('h1', null, text))
      export default createClientApp({
        head: { title: 'Site', titleTemplate: '%s · Site', siteUrl: 'https://site.example', description: 'Default' },
        NotFound: () => h('h1', null, 'Not here'),
        routes: {
          '/': Page('Home'),
          '/about': { component: Page('About us'), head: { title: 'About', description: 'Who we are' } },
          '/docs/intro': { component: Page('Intro'), head: { title: 'Intro' } },
          '/hidden': { component: Page('Hidden'), head: { title: 'Hidden', noindex: true } },
          '/posts/:id': { component: Page('A post'), head: (p) => ({ title: 'Post ' + p.id }) },
          '/account': { component: Page('Account'), auth: true }
        }
      })
    `)
    await prerender(app, 'dist/client', { paths: ['/posts/1'] })
  })

  after(() => rmSync(app, { recursive: true, force: true }))

  const read = (file) => readFileSync(join(out, file), 'utf8')

  test('each static route is written with its content and head', () => {
    const about = read('about.html')
    assert.match(about, /<h1>About us<\/h1>/)
    assert.match(about, /<title>About · Site<\/title>/)
    assert.match(about, /<meta name="description" content="Who we are">/)
    assert.match(about, /<link rel="canonical" href="https:\/\/site.example\/about">/)
    assert.doesNotMatch(about, /content="template"|<title>Template/, 'the template\'s own tags are replaced, not duplicated')
    assert.match(about, /src="\/assets\/app-1234abcd.js"/, 'the app still loads')

    assert.match(read('index.html'), /<title>Site<\/title>[\s\S]*<h1>Home<\/h1>/)
    assert.match(read('docs/intro.html'), /<title>Intro · Site<\/title>/)
  })

  test('param and guarded routes are not prerendered unless listed', () => {
    assert.ok(!existsSync(join(out, 'account.html')))
    assert.match(read('posts/1.html'), /<title>Post 1 · Site<\/title>[\s\S]*<h1>A post<\/h1>/)
  })

  test('404.html is the NotFound page, noindex', () => {
    const page = read('404.html')
    assert.match(page, /<h1>Not here<\/h1>/)
    assert.match(page, /<meta name="robots" content="noindex">/)
  })

  test('the clean shell and every route pattern are kept for the server', () => {
    assert.match(read('.basicben/shell.html'), /<div id="root"><\/div>/)
    assert.deepStrictEqual(JSON.parse(read('.basicben/routes.json')).routes,
      ['/', '/about', '/docs/intro', '/hidden', '/posts/:id', '/account'])
  })

  test('the sitemap lists indexable prerendered pages; robots.txt points at it', () => {
    const sitemap = read('sitemap.xml')
    assert.match(sitemap, /<loc>https:\/\/site.example\/about<\/loc>/)
    assert.match(sitemap, /<loc>https:\/\/site.example\/<\/loc>/)
    assert.doesNotMatch(sitemap, /hidden|account/)
    assert.match(read('robots.txt'), /Sitemap: https:\/\/site.example\/sitemap.xml/)
  })

  test('a second run refuses an already-prerendered index.html', async () => {
    await assert.rejects(prerender(app, 'dist/client'), /no empty <div id="root"><\/div>/)
  })
})
