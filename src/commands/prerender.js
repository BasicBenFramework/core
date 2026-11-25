/**
 * Prerender: write each page's HTML at build time.
 *
 * The client renders in the browser, so without this every URL is served the
 * same empty `<div id="root">` under one <title>. Search engines that run
 * JavaScript do so late and not always; link previews and most other crawlers
 * never do. This renders every static route to HTML with its own head tags
 * (from createClientApp's `head` and each route's `head`) and writes:
 *
 *   /               → index.html
 *   /docs           → docs.html            served at /docs by spaFallback, and by
 *   /docs/routing   → docs/routing.html    Cloudflare Pages, Netlify and Vercel (cleanUrls)
 *   unmatched paths → 404.html             noindex; served with a 404 status
 *   .basicben/shell.html                   the clean shell, for client routes not prerendered
 *   .basicben/routes.json                  every client route pattern, so the server can
 *                                          answer a path none matches with a real 404
 *   sitemap.xml, robots.txt                when `head.siteUrl` is set (robots.txt only if
 *                                          the app's public/ has none)
 *
 * Prerendered: routes without params and without `auth`/`guest` guards, plus
 * any `paths` listed in the config. The browser still mounts the app as before
 * and renders the page afresh, so behaviour does not change; the markup is for
 * crawlers, previews and the first paint.
 *
 * During the render `window.location` is the page's URL and nothing else of
 * the browser exists: a component that reads `window`, `document` or
 * `localStorage` while rendering (not in an effect) fails the build, with the
 * route named.
 *
 * Turned on by `prerender: true` (or an object, below) in basicben.config.js,
 * or `basicben build --prerender`.
 *
 * @typedef {object} PrerenderOptions
 * @property {string} [entry] - the module whose default export is createClientApp's result;
 *   default the first of src/routes/App.{tsx,jsx,ts,js}
 * @property {string[]} [paths] - extra paths to render, e.g. `/posts/1` for a param route
 * @property {boolean} [notFound] - write 404.html (default true)
 * @property {boolean} [sitemap] - write sitemap.xml and robots.txt when siteUrl is known (default true)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveHead, routeHead, headTags, NOT_FOUND_HEAD } from '../client/head.js'
import { BUILD_META_DIR } from '../server/static.js'
import { compileRoute } from '../routing/match.js'

const ENTRIES = ['src/routes/App.tsx', 'src/routes/App.jsx', 'src/routes/App.ts', 'src/routes/App.js']

/**
 * The path 404.html is rendered at. The NotFound component may show it, so
 * `/404` reads better than a sentinel — unless the app routes `/404` itself.
 */
const NOT_FOUND_PATHS = ['/404', '/__basicben_not_found__']

/**
 * @param {string} cwd - the app's root
 * @param {string} outDir - the client build, relative to cwd
 * @param {PrerenderOptions} [options]
 * @returns {Promise<{ pages: string[] }>}
 */
export async function prerender(cwd, outDir, options = {}) {
  const out = resolve(cwd, outDir)
  const entry = options.entry || ENTRIES.find((candidate) => existsSync(resolve(cwd, candidate)))
  if (!entry) throw new Error(`prerender: no client routes module (looked for ${ENTRIES.join(', ')}); set prerender.entry`)

  const shellFile = join(out, 'index.html')
  const shell = readFileSync(shellFile, 'utf8')
  if (!shell.includes('<div id="root"></div>')) {
    throw new Error(`prerender: ${outDir}/index.html has no empty <div id="root"></div> to render into`)
  }

  // The app's own Vite and React, not copies the framework might resolve:
  // the page modules import React through the app, and two Reacts break hooks.
  const appRequire = createRequire(join(cwd, 'package.json'))
  const load = (name) => import(pathToFileURL(appRequire.resolve(name)).href)
  const { createServer } = await load('vite')
  const { renderToString } = await load('react-dom/server')
  const { createElement } = await load('react')

  const vite = await createServer({
    root: cwd,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false }
  })

  try {
    const { default: App } = await vite.ssrLoadModule(`/${entry}`)
    if (typeof App !== 'function' || !Array.isArray(App.routes)) {
      throw new Error(`prerender: the default export of ${entry} is not createClientApp's result`)
    }

    const config = App.head || {}
    const routes = App.routes
    const isStatic = (route) => !route.auth && !route.guest && !/[:*]/.test(route.path)
    const paths = [...new Set([...routes.filter(isStatic).map((route) => normalize(route.path)), ...(options.paths || []).map(normalize)])]

    const render = (path) => {
      const url = new URL(path, config.siteUrl || 'http://localhost')
      const previous = globalThis.window
      globalThis.window = { location: { pathname: url.pathname, search: '', hash: '', href: url.href, origin: url.origin } }
      // Node 22+ has an experimental global localStorage that warns when
      // touched. A browser-less render has no storage: hide it, so code that
      // checks `typeof localStorage` sees none and nothing warns.
      const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
      if (storage?.configurable) Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true })
      try {
        return renderToString(createElement(App))
      } catch (err) {
        err.message = `prerender: rendering ${path} failed: ${err.message}\n` +
          '  A component read a browser global (window, document, localStorage) while rendering. ' +
          'Move that into an effect, or leave the route out of the prerender.'
        throw err
      } finally {
        if (previous === undefined) delete globalThis.window
        else globalThis.window = previous
        if (storage?.configurable) Object.defineProperty(globalThis, 'localStorage', storage)
      }
    }

    // The shell as it was, before index.html becomes the home page.
    mkdirSync(join(out, BUILD_META_DIR), { recursive: true })
    writeFileSync(join(out, BUILD_META_DIR, 'shell.html'), shell)
    writeFileSync(join(out, BUILD_META_DIR, 'routes.json'), JSON.stringify({ routes: routes.map((route) => route.path) }, null, 2) + '\n')

    const page = (path, file, pageHead) => {
      const head = resolveHead(config, pageHead, path)
      const html = injectHead(shell, App.managesHead ? headTags(head) : null)
        .replace('<div id="root"></div>', `<div id="root">${render(path)}</div>`)
      const target = join(out, file)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, html)
      return head
    }

    // A listed path like /posts/1 takes its head from /posts/:id, with params.
    const compiled = routes.map((route) => ({ route, matcher: compileRoute(route.path) }))
    const matchPath = (path) => {
      for (const { route, matcher } of compiled) {
        const params = matcher.match(path)
        if (params) return { route, params }
      }
      return null
    }

    const indexed = []
    for (const path of paths) {
      const match = matchPath(path)
      const head = page(path, path === '/' ? 'index.html' : `${path.slice(1)}.html`, match ? routeHead(match.route, match.params) : NOT_FOUND_HEAD)
      if (!head.noindex) indexed.push(path)
      console.log(`  prerendered ${path}`)
    }

    if (options.notFound !== false) {
      const unrouted = NOT_FOUND_PATHS.find((path) => !matchPath(path)) ?? NOT_FOUND_PATHS[1]
      page(unrouted, '404.html', NOT_FOUND_HEAD)
      console.log('  prerendered 404.html')
    }

    if (options.sitemap !== false && config.siteUrl) {
      const site = String(config.siteUrl).replace(/\/+$/, '')
      writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map((path) => `  <url><loc>${escapeXml(site + path)}</loc></url>`).join('\n')}
</urlset>
`)
      // An app that wrote its own robots.txt keeps it; Vite copied it already.
      if (!existsSync(resolve(cwd, 'public/robots.txt'))) {
        writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
      }
      console.log(`  wrote sitemap.xml (${indexed.length} URLs)`)
    }

    return { pages: paths }
  } finally {
    await vite.close()
  }
}

/** Replace the shell's <title> with the page's head tags, or add them before </head>. */
function injectHead(shell, tags) {
  if (!tags) return shell
  // Tags the page's head now owns, if the template had its own: two
  // descriptions or two canonicals are worse than none.
  shell = shell
    .replace(/[ \t]*<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*\n?/gi, '')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\s*\n?/gi, '')
  if (/<title>[\s\S]*?<\/title>/.test(shell)) return shell.replace(/<title>[\s\S]*?<\/title>/, tags)
  return shell.replace('</head>', `  ${tags}\n  </head>`)
}

function normalize(path) {
  const clean = String(path || '/').split(/[?#]/)[0]
  return clean.length > 1 ? clean.replace(/\/+$/, '') || '/' : '/'
}

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
