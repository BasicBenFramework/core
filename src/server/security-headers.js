/**
 * Default security headers.
 *
 * None of these are exotic, and every one of them was missing: a response with
 * no `X-Content-Type-Options` can be sniffed into HTML, one with no framing
 * policy can be clickjacked, and a cross-origin link leaked the full URL —
 * query string included — in Referer.
 *
 * On by default from `createServer`. Configure with `securityHeaders` in
 * `basicben.config.js`:
 *
 * ```js
 * securityHeaders: false                          // none of this
 * securityHeaders: { frameOptions: 'SAMEORIGIN' } // override one
 * securityHeaders: { hsts: false }                // keep the rest
 * ```
 *
 * Each value is the header's value, or `false` to leave that header off. The
 * headers are set before the handler runs, so a handler that sets its own —
 * a page with a real CSP, say — replaces them.
 */

/**
 * @typedef {Object} SecurityHeadersOptions
 * @property {string|false} [contentTypeOptions] - X-Content-Type-Options; default `nosniff`
 * @property {string|false} [referrerPolicy] - Referrer-Policy; default `strict-origin-when-cross-origin`
 * @property {string|false} [frameOptions] - X-Frame-Options; default `DENY`
 * @property {string|false} [contentSecurityPolicy] - default `frame-ancestors 'none'`, the modern equivalent of X-Frame-Options
 * @property {string|false} [hsts] - Strict-Transport-Security; default `max-age=15552000; includeSubDomains`, production only
 * @property {boolean} [production] - whether to send HSTS; defaults to NODE_ENV === 'production'
 */

/** @type {Required<Omit<SecurityHeadersOptions, 'production'>>} */
export const DEFAULT_SECURITY_HEADERS = {
  contentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  frameOptions: 'DENY',
  contentSecurityPolicy: "frame-ancestors 'none'",
  hsts: 'max-age=15552000; includeSubDomains'
}

/**
 * Middleware setting the default security headers.
 *
 * HSTS is sent only in production: sent from `http://localhost` it is ignored,
 * but sent from a development hostname served over TLS it pins that host to
 * HTTPS for six months, which is a surprising thing for a dev server to do.
 *
 * @param {SecurityHeadersOptions} [options]
 * @returns {(req: any, res: any, next: Function) => any}
 */
export function securityHeaders(options = {}) {
  const config = { ...DEFAULT_SECURITY_HEADERS, ...options }
  const production = options.production ?? process.env.NODE_ENV === 'production'

  /** @type {Array<[string, string]>} */
  const headers = []
  if (config.contentTypeOptions) headers.push(['X-Content-Type-Options', config.contentTypeOptions])
  if (config.referrerPolicy) headers.push(['Referrer-Policy', config.referrerPolicy])
  if (config.frameOptions) headers.push(['X-Frame-Options', config.frameOptions])
  if (config.contentSecurityPolicy) headers.push(['Content-Security-Policy', config.contentSecurityPolicy])
  if (production && config.hsts) headers.push(['Strict-Transport-Security', config.hsts])

  return (req, res, next) => {
    for (const [name, value] of headers) res.setHeader(name, value)
    return next()
  }
}
