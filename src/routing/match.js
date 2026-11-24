/**
 * The one route matcher.
 *
 * The HTTP app, the Router and the client router all match paths here, so a
 * route means the same thing wherever it is registered. Until 0.9.0 there were
 * three, and production used the weakest: no trailing-slash handling, `.` in
 * `/feed.xml` matched any character, and params arrived still percent-encoded.
 *
 * Pattern syntax:
 * - `/posts/:id` — a param matches one non-empty segment, or part of one
 *   (`/feed/:name.xml`). Its value is URI-decoded, except `%2F` and `%5C`,
 *   which stay encoded so a param never carries a path separator.
 * - `/files/*` — a trailing `*` matches the rest of the path, including
 *   nothing; the value is `params._catchAll`, decoded the same way. Its `/`
 *   are the request's own separators; `..` segments never reach it, because
 *   URL parsing resolves them first.
 * - `*` on its own matches every path.
 * - Everything else is literal: `.`, `(`, `+` and friends mean themselves.
 *
 * Paths compare without a trailing slash, so `/about/` matches `/about`.
 * Matching is case-sensitive.
 *
 * This module has no dependencies, so the client bundle can import it.
 */

/**
 * Leading slash, no trailing slash, `/` for empty.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
  if (!path || path === '/') return '/'
  let normalized = path.startsWith('/') ? path : '/' + path
  normalized = normalized.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A literal as it appears in a request's pathname. WHATWG URL parsing
 * percent-encodes a few ASCII characters (space, `"`, `#`, `<`, `>`, `?`, `^`,
 * backtick, `{`, `}`) and everything outside ASCII, so `/café` arrives as
 * `/caf%C3%A9`. The same set is encoded here; `%` is left alone, so a literal
 * written already encoded still matches.
 */
function encodeLiteral(text) {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code <= 0x20 || code >= 0x7f || '"#<>?^`{}'.includes(char)) {
      for (const byte of new TextEncoder().encode(char)) {
        out += '%' + byte.toString(16).toUpperCase().padStart(2, '0')
      }
    } else {
      out += char
    }
  }
  return out
}

/**
 * The error a malformed escape in a param produces. Carries status 400, which
 * the default error handler sends as is.
 *
 * @param {string} raw
 * @returns {Error & { statusCode: number }}
 */
function badRequest(raw) {
  const err = /** @type {Error & { statusCode: number }} */ (new Error(`Malformed URL encoding in "${raw}"`))
  err.statusCode = 400
  return err
}

/**
 * Decode a param, except for an encoded slash or backslash.
 *
 * `%2F` and `%5C` stay as they are, uppercased. Decoded, they would turn one
 * segment into a path: `/files/..%2F..%2Fetc%2Fpasswd` would give
 * `../../etc/passwd`, and an app joining that onto a directory would be
 * traversable. URL parsing has already resolved real `..` segments, including
 * `%2e%2e`, so with these two kept encoded a param cannot climb a directory.
 */
function decode(raw) {
  try {
    return raw
      .split(/(%2F|%5C)/i)
      .map((part, i) => (i % 2 === 1 ? part.toUpperCase() : decodeURIComponent(part)))
      .join('')
  } catch {
    throw badRequest(raw)
  }
}

/**
 * @typedef {Object} CompiledRoute
 * @property {string} path - the normalised pattern
 * @property {RegExp} regex
 * @property {string[]} keys - param names, in order
 * @property {(pathname: string) => Record<string, string> | null} match -
 *   params for a matching pathname, else null. Throws an error with
 *   `statusCode: 400` when a param is not valid percent-encoding.
 */

/**
 * Compile a route pattern.
 *
 * @param {string} pattern
 * @returns {CompiledRoute}
 */
export function compileRoute(pattern) {
  if (pattern === '*') {
    return {
      path: '*',
      regex: /^.*$/,
      keys: [],
      match: () => ({})
    }
  }

  const path = normalizePath(pattern)
  const keys = []
  let catchAll = false
  let body = path

  if (body === '/*' || body.endsWith('/*')) {
    catchAll = true
    body = body.slice(0, -2)
  }

  let source = ''
  let last = 0
  for (const m of body.matchAll(/:(\w+)/g)) {
    source += escapeRegex(encodeLiteral(body.slice(last, m.index)))
    source += '([^/]+)'
    keys.push(m[1])
    last = m.index + m[0].length
  }
  source += escapeRegex(encodeLiteral(body.slice(last)))

  if (catchAll) {
    // `/files/*` matches `/files` and `/files/a/b`, not `/filesystem`.
    source += '(?:/(.*))?'
  } else if (source === '') {
    source = '/'
  }

  const regex = new RegExp(`^${source}$`)

  return {
    path,
    regex,
    keys,
    match(pathname) {
      const m = normalizePath(pathname).match(regex)
      if (!m) return null

      const params = {}
      keys.forEach((key, i) => {
        params[key] = decode(m[i + 1])
      })
      if (catchAll) {
        params._catchAll = decode(m[keys.length + 1] ?? '')
      }
      return params
    }
  }
}

/**
 * A query string as an object. A key given once is a string; a key given more
 * than once is an array of every value, in order. Until 0.9.0 the server kept
 * only the last, so `?tag=a&tag=b` lost `a`.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string | string[]>}
 */
export function parseQuery(searchParams) {
  const entries = []
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key)
    entries.push([key, all.length > 1 ? all : all[0]])
  }
  // fromEntries defines properties, so a `__proto__` key is data, not a
  // prototype.
  return Object.fromEntries(entries)
}
