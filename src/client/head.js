/**
 * Page metadata: <title>, description, canonical, robots, Open Graph,
 * Twitter cards and JSON-LD.
 *
 * One description of a page's head, used twice: `headTags()` writes it as
 * HTML at build time (the prerender, which is what crawlers and link previews
 * read), and `applyHead()` writes it into the live document as the visitor
 * navigates. Both start from `resolveHead()`, so the two cannot disagree.
 *
 * Where it comes from, most specific last:
 *
 *   createClientApp({ head: { title, titleTemplate, description, siteUrl, image } })
 *   a route's `head`: { title, description, image, noindex, ... } or (params) => ({ ... })
 *   useHead({ ... }) inside the page, for what is known only after a fetch
 *
 * No DOM access at import, so the prerender imports this in Node.
 */

/**
 * @typedef {object} HeadConfig - createClientApp's `head`: the site-wide defaults
 * @property {string} [title] - the site's name: the title of a page that sets none, and og:site_name
 * @property {string | ((title: string) => string)} [titleTemplate] - how a page's title becomes
 *   the <title>: `'%s — My Site'`, or a function. Default: the page title alone
 * @property {string} [description] - for pages that set none
 * @property {string} [siteUrl] - absolute origin, e.g. `https://example.com`; canonical and
 *   og:url are built from it. Without it, neither is emitted
 * @property {string} [image] - absolute URL of the default share image
 * @property {string} [locale] - og:locale, e.g. `en_GB`
 * @property {string} [twitterSite] - the site's @handle
 */

/**
 * @typedef {object} HeadMeta - one page's head
 * @property {string} [title]
 * @property {boolean} [fullTitle] - use `title` as the whole <title>, without the template
 * @property {string | null} [description]
 * @property {string | null} [canonical] - absolute URL; default siteUrl + path
 * @property {string | null} [image]
 * @property {boolean} [noindex]
 * @property {'website' | 'article' | 'profile' | string} [type]
 * @property {Record<string, unknown> | Record<string, unknown>[] | null} [jsonLd]
 */

/** What an unmatched path's head says when the app says nothing. */
export const NOT_FOUND_HEAD = { title: 'Page not found', noindex: true }

/**
 * The resolved head for one page: every fallback decided.
 *
 * @param {HeadConfig | undefined} config
 * @param {HeadMeta | null | undefined} page - the route's head merged with useHead's
 * @param {string} pathname
 * @returns {{ title: string, ogTitle: string, description: string | null, canonical: string | null,
 *   image: string | null, noindex: boolean, type: string, siteName: string | null,
 *   locale: string | null, twitterSite: string | null, jsonLd: unknown }}
 */
export function resolveHead(config = {}, page = {}, pathname = '/') {
  config = config || {}
  page = page || {}
  const siteName = config.title || null
  const pageTitle = page.title || null

  let title = pageTitle || siteName || ''
  if (pageTitle && !page.fullTitle && config.titleTemplate && pageTitle !== siteName) {
    title = typeof config.titleTemplate === 'function'
      ? config.titleTemplate(pageTitle)
      : config.titleTemplate.replace('%s', pageTitle)
  }

  const siteUrl = config.siteUrl ? String(config.siteUrl).replace(/\/+$/, '') : null
  const path = normalize(pathname)
  const canonical = page.canonical !== undefined
    ? page.canonical
    : siteUrl && !page.noindex ? siteUrl + path : null

  return {
    title,
    ogTitle: pageTitle || siteName || '',
    description: page.description !== undefined ? page.description : config.description || null,
    canonical: canonical || null,
    image: page.image !== undefined ? page.image : config.image || null,
    noindex: Boolean(page.noindex),
    type: page.type || 'website',
    siteName,
    locale: config.locale || null,
    twitterSite: config.twitterSite || null,
    jsonLd: page.jsonLd || null
  }
}

/** A route's head for these params: its object, or what its function returns. */
export function routeHead(route, params = {}) {
  const head = route?.head
  if (!head) return null
  return typeof head === 'function' ? head(params) : head
}

/** Path without a query, hash or trailing slash; `/` stays `/`. */
function normalize(pathname) {
  const path = String(pathname || '/').split(/[?#]/)[0]
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : '/'
}

/**
 * The tags a resolved head becomes, in the order they are written.
 * Each is `[selector, tag, attributes]` for applyHead and headTags alike.
 */
function tagList(head) {
  const meta = (key, name, content) => content ? [[`meta[${key}="${name}"]`, 'meta', { [key]: name, content }]] : []
  return [
    ...meta('name', 'description', head.description),
    ...(head.canonical ? [['link[rel="canonical"]', 'link', { rel: 'canonical', href: head.canonical }]] : []),
    ...meta('name', 'robots', head.noindex ? 'noindex' : null),
    ...meta('property', 'og:site_name', head.siteName),
    ...meta('property', 'og:type', head.type),
    ...meta('property', 'og:title', head.ogTitle),
    ...meta('property', 'og:description', head.description),
    ...meta('property', 'og:url', head.canonical),
    ...meta('property', 'og:image', head.image),
    ...meta('property', 'og:locale', head.locale),
    ...meta('name', 'twitter:card', head.image ? 'summary_large_image' : 'summary'),
    ...meta('name', 'twitter:site', head.twitterSite),
    ...meta('name', 'twitter:title', head.ogTitle),
    ...meta('name', 'twitter:description', head.description),
    ...meta('name', 'twitter:image', head.image)
  ]
}

/** Every selector applyHead manages, so a tag a page no longer has is removed. */
const MANAGED = tagList({
  description: 'x', canonical: 'x', noindex: true, siteName: 'x', type: 'x', ogTitle: 'x',
  image: 'x', locale: 'x', twitterSite: 'x'
}).map(([selector]) => selector)

const JSON_LD_SELECTOR = 'script[type="application/ld+json"][data-head]'

/**
 * The head as HTML, for the prerender: `<title>` first, then the tags.
 *
 * @param {ReturnType<typeof resolveHead>} head
 * @returns {string}
 */
export function headTags(head) {
  const lines = [`<title>${escapeHtml(head.title)}</title>`]
  for (const [, tag, attributes] of tagList(head)) {
    const attrs = Object.entries(attributes).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ')
    lines.push(`<${tag} ${attrs}>`)
  }
  if (head.jsonLd) {
    lines.push(`<script type="application/ld+json" data-head>${jsonForScript(head.jsonLd)}</script>`)
  }
  return lines.join('\n    ')
}

/**
 * Write a resolved head into the live document: set the title, update the
 * tags it manages, add the missing ones and remove the ones this page does not
 * have. Tags the app wrote itself (a viewport, a stylesheet) are not touched.
 *
 * @param {ReturnType<typeof resolveHead>} head
 * @param {Document} [doc]
 */
export function applyHead(head, doc = globalThis.document) {
  if (!doc?.head) return
  if (head.title) doc.title = head.title

  const wanted = new Map(tagList(head).map(([selector, tag, attributes]) => [selector, { tag, attributes }]))
  for (const selector of MANAGED) {
    const existing = doc.head.querySelector(selector)
    const want = wanted.get(selector)
    if (!want) {
      existing?.remove()
      continue
    }
    const el = existing || doc.head.appendChild(doc.createElement(want.tag))
    for (const [key, value] of Object.entries(want.attributes)) el.setAttribute(key, value)
  }

  const script = doc.head.querySelector(JSON_LD_SELECTOR)
  if (!head.jsonLd) {
    script?.remove()
  } else {
    const el = script || doc.head.appendChild(doc.createElement('script'))
    el.setAttribute('type', 'application/ld+json')
    el.setAttribute('data-head', '')
    el.textContent = JSON.stringify(head.jsonLd)
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** JSON that cannot close its <script> block. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
