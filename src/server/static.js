/**
 * Static file serving middleware.
 * Serves files from a directory with caching headers.
 */

import { createReadStream, statSync, readFileSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { createGzip, createBrotliCompress, constants as zlib } from 'node:zlib'
import { conditional, weakEtag, parseRange } from './etag.js'
import { compileRoute } from '../routing/match.js'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.zip': 'application/zip'
}

/**
 * Extensions that are never rendered inline from an untrusted mount.
 *
 * Each is a type a browser treats as an active document or script. Served
 * inline from the app's origin, any one of them is same-origin script
 * execution — so from a directory users write to they go out as downloads.
 */
const ACTIVE_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.xht', '.shtml', '.mht', '.mhtml',
  '.svg', '.svgz', '.xml', '.xsl', '.xslt',
  '.js', '.mjs', '.cjs', '.wasm'
])

/** Types worth compressing: text, and the text formats with other names. */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/

/** Below this, compression saves less than its own overhead. */
const MIN_COMPRESS_BYTES = 1024

/** A year: what a file whose name changes with its content can be cached for. */
const IMMUTABLE_MAX_AGE = 31536000

/**
 * Where the build writes what the server needs but must not serve: the clean
 * app shell and the client route list (see commands/prerender.js). A dot
 * directory, so serveStatic's dotfile rule keeps it private.
 */
export const BUILD_META_DIR = '.basicben'

const defaults = {
  dir: 'public',
  prefix: '/',
  maxAge: 86400, // 24 hours in seconds
  // Paths (below the prefix) whose file names carry a content hash, cached for
  // a year as immutable. Vite writes its hashed output to /assets/.
  immutable: [/^\/assets\//],
  index: 'index.html',
  dotfiles: 'ignore', // 'ignore', 'allow', 'deny'
  compress: true, // gzip or brotli for text files of 1 KB and up
  spa: false, // serve index.html for unmatched client routes
  spaExclude: [/^\/api\//],
  untrusted: false // the directory holds user uploads; see serveStatic
}

/**
 * Cache-Control for a static file.
 *
 * HTML is `no-cache` (stored, but revalidated every time — cheap with the
 * ETag): a page names the hashed assets of the build that wrote it, and a
 * stale one points at files the next deploy deleted. Hashed assets never
 * change under their name, so they are cached for a year. Everything else
 * gets `maxAge`.
 */
function cacheControlFor(filePath, mime, config) {
  if (mime.startsWith('text/html')) return 'no-cache'
  if ((config.immutable || []).some((pattern) => pattern.test(filePath))) {
    return `public, max-age=${IMMUTABLE_MAX_AGE}, immutable`
  }
  return `public, max-age=${config.maxAge}`
}

/**
 * The encoding to send a body in, or null for none.
 *
 * Brotli when the client takes it, else gzip. Only for compressible types of
 * at least 1 KB, never for a range request (byte offsets are into the
 * uncompressed file).
 */
function chooseEncoding(req, mime, size, config) {
  if (!config.compress || size < MIN_COMPRESS_BYTES || !COMPRESSIBLE.test(mime)) return null
  if (req.headers?.range) return null
  // `gzip;q=0` is a refusal, so the weights are read rather than matched.
  const accepted = new Set()
  for (const part of String(req.headers?.['accept-encoding'] || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    if (name && !(q && Number(q.slice(2)) === 0)) accepted.add(name)
  }
  const takes = (name) => accepted.has(name)
  if (takes('br')) return 'br'
  if (takes('gzip')) return 'gzip'
  return null
}

/**
 * Stream a file to the response, compressed if `encoding` says so.
 * Content-Length is set by the caller only for an uncompressed body.
 */
function sendFile(req, res, fullPath, { encoding = null, range = null, label = 'Static file' } = {}) {
  if (encoding) res.setHeader('Content-Encoding', encoding)

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  let stream = createReadStream(fullPath, range ? { start: range.start, end: range.end } : undefined)
  const source = stream
  if (encoding) {
    const compressor = encoding === 'br'
      ? createBrotliCompress({ params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } })
      : createGzip({ level: 6 })
    stream = stream.pipe(compressor)
  }

  stream.pipe(res)
  source.on('error', (err) => {
    console.error(`${label} error:`, err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    } else {
      res.destroy(err)
    }
  })
}

/**
 * Serve files from a directory.
 *
 * `untrusted: true` is for directories users write to, such as the local
 * storage driver's uploads. Every response then carries
 * `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, and
 * anything a browser would run or render as a document (HTML, SVG, XML,
 * JavaScript) is sent as `application/octet-stream` with
 * `Content-Disposition: attachment` instead of inline. The upload path already
 * stores files under an extension derived from their validated type; this is
 * the second wall, for files that got there some other way.
 *
 * @param {Object} [options]
 * @param {string} [options.dir]
 * @param {string} [options.prefix]
 * @param {number} [options.maxAge] - seconds, for files that are neither HTML (always
 *   `no-cache`) nor under an `immutable` path
 * @param {RegExp[]} [options.immutable] - paths below the prefix whose names carry a content
 *   hash, cached for a year as immutable (default `[/^\/assets\//]`, where Vite writes)
 * @param {boolean} [options.compress] - gzip or brotli for text files of 1 KB and up (default true)
 * @param {string} [options.index]
 * @param {'ignore'|'allow'|'deny'} [options.dotfiles]
 * @param {boolean} [options.spa]
 * @param {RegExp[]} [options.spaExclude]
 * @param {boolean} [options.untrusted]
 * @returns {Function} middleware
 */
export function serveStatic(options = {}) {
  const config = { ...defaults, ...options }
  const root = resolve(process.cwd(), config.dir)
  const prefix = config.prefix.endsWith('/') ? config.prefix : config.prefix + '/'

  return (req, res, next) => {
    // Only handle GET and HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    // Check if path starts with prefix
    let urlPath = req.path || req.url.split('?')[0]
    if (!urlPath.startsWith(prefix) && urlPath !== config.prefix.replace(/\/$/, '')) {
      return next()
    }

    // Remove prefix to get file path
    let filePath = urlPath.slice(prefix.length - 1) || '/'

    // Prevent directory traversal
    if (filePath.includes('..')) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }

    // Handle dotfiles
    const segments = filePath.split('/')
    const hasDotfile = segments.some(s => s.startsWith('.') && s !== '.')
    if (hasDotfile) {
      if (config.dotfiles === 'deny') {
        res.statusCode = 403
        res.end('Forbidden')
        return
      }
      if (config.dotfiles === 'ignore') {
        return next()
      }
    }

    let fullPath = join(root, filePath)

    // Check if file exists
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      return next()
    }

    // If directory, try index file
    if (stat.isDirectory()) {
      const indexPath = join(fullPath, config.index)
      try {
        stat = statSync(indexPath)
        if (!stat.isFile()) return next()
        fullPath = indexPath  // Update fullPath to point to the index file
      } catch {
        return next()
      }
    }

    if (!stat.isFile()) {
      return next()
    }

    // Get mime type
    const ext = extname(fullPath).toLowerCase()
    let mime = mimeTypes[ext] || 'application/octet-stream'

    if (config.untrusted) {
      // Without nosniff a browser may decide a "text/plain" upload is HTML
      // after all; the sandbox stops anything that does render from running
      // script with the app's origin.
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // Appended rather than replaced, so a framing policy set by the
      // security-headers middleware survives.
      const existing = res.getHeader('Content-Security-Policy')
      res.setHeader('Content-Security-Policy', existing ? `${existing}; sandbox` : 'sandbox')

      if (ACTIVE_EXTENSIONS.has(ext)) {
        mime = 'application/octet-stream'
        res.setHeader('Content-Disposition', 'attachment')
      }
    }

    // Set headers
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    if (config.compress && COMPRESSIBLE.test(mime)) res.setHeader('Vary', 'Accept-Encoding')

    // The validators go on before anything else, and a client whose copy is
    // still good gets a 304 here rather than the file. Last-Modified was
    // already being sent; what was missing was ever reading the
    // If-Modified-Since that came back, so every conditional request was
    // answered with the whole body.
    const answered = conditional(req, res, {
      etag: weakEtag(stat),
      lastModified: stat.mtime,
      cacheControl: cacheControlFor(filePath, mime, config)
    })

    if (answered) return

    const range = parseRange(req.headers.range, stat.size)

    if (range?.unsatisfiable) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${stat.size}`)
      res.end()
      return
    }

    const start = range ? range.start : 0
    const end = range ? range.end : stat.size - 1
    const length = end - start + 1

    if (range) {
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    }

    const encoding = config.untrusted ? null : chooseEncoding(req, mime, stat.size, config)
    if (!encoding) res.setHeader('Content-Length', length)

    sendFile(req, res, fullPath, { encoding, range: range ? { start, end } : null })
  }
}

/**
 * SPA history fallback.
 *
 * Wraps a not-found handler so unmatched client routes serve index.html and the
 * browser-side router can take over. Intended for `onNoMatch`, which runs after
 * route matching — putting this in the middleware chain would shadow the API,
 * since static middleware runs before routes are matched.
 *
 * After `basicben build` with `prerender` on, it does three more things, all
 * from files the build wrote:
 *
 * - a prerendered page is served for its path: `/docs/routing` gets
 *   `docs/routing.html`, with its own content and head tags;
 * - a path no client route matches gets a real **404** (with `404.html` if
 *   the build wrote one) instead of a 200 that search engines record as a soft
 *   404 — the build saved the client route patterns to `.basicben/routes.json`;
 * - a client route that was not prerendered (one with params, a guarded one)
 *   gets the clean shell, `.basicben/shell.html`, not `index.html` — which is
 *   now the prerendered home page, and would give every such URL the home
 *   page's content and canonical link.
 *
 * Without those files it behaves as it always has.
 */
export function spaFallback(options = {}, next) {
  const config = { ...defaults, ...options }
  const root = resolve(process.cwd(), config.dir)
  const indexPath = join(root, config.index)
  const exclude = config.spaExclude || defaults.spaExclude

  // Read once, on the first request: the build wrote them before start.
  let meta
  const buildMeta = () => {
    if (meta) return meta
    const shellPath = join(root, BUILD_META_DIR, 'shell.html')
    const notFoundPath = join(root, '404.html')
    let routes = null
    try {
      const patterns = JSON.parse(readFileSync(join(root, BUILD_META_DIR, 'routes.json'), 'utf8')).routes
      if (Array.isArray(patterns)) routes = patterns.map((pattern) => compileRoute(pattern))
    } catch {}
    meta = {
      shell: isFile(shellPath) ? shellPath : indexPath,
      notFound: isFile(notFoundPath) ? notFoundPath : null,
      routes
    }
    return meta
  }

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next(req, res)
    }

    const urlPath = req.path || req.url.split('?')[0]

    if (exclude.some((pattern) => pattern.test(urlPath))) {
      return next(req, res)
    }

    // A request for a missing asset should 404, not receive the app shell —
    // returning HTML for a .js request produces a confusing MIME type error.
    const ext = extname(urlPath).toLowerCase()
    if (ext && ext !== '.html') {
      return next(req, res)
    }

    const { shell, notFound, routes } = buildMeta()

    // A prerendered page for this path. Dot segments and dotfiles are never
    // looked up: `..` is resolved by URL parsing already, and the build's
    // private directory starts with a dot.
    const clean = urlPath.replace(/\/+$/, '')
    if (clean && !ext && !clean.split('/').some((segment) => segment.startsWith('.'))) {
      const page = join(root, `${clean}.html`)
      if (page.startsWith(root) && isFile(page)) return sendHtmlFile(req, res, page, 200, config)
    }

    if (routes && !routes.some((route) => {
      try { return route.match(urlPath) !== null } catch { return false }
    })) {
      return sendHtmlFile(req, res, notFound ?? shell, 404, config)
    }

    if (!isFile(shell)) return next(req, res)
    sendHtmlFile(req, res, shell, 200, config)
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function sendHtmlFile(req, res, path, status, config) {
  const { size } = statSync(path)
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // The shell references hashed assets that change on every build, so it must
  // never be cached — a stale shell points at files that no longer exist.
  res.setHeader('Cache-Control', 'no-cache')
  if (config.compress) res.setHeader('Vary', 'Accept-Encoding')

  const encoding = chooseEncoding(req, 'text/html', size, config)
  if (!encoding) res.setHeader('Content-Length', size)
  sendFile(req, res, path, { encoding, label: 'SPA fallback' })
}
