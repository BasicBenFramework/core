/**
 * The client router's logic, without React, so it can be tested without a
 * browser or a renderer.
 */

import { compileRoute } from '../routing/match.js'

/**
 * @typedef {Object} ClientLocation
 * @property {string} pathname - e.g. `/posts/1`
 * @property {string} search - `?q=x`, or ''
 * @property {string} hash - `#top`, or ''
 */

/**
 * Resolve a navigation target against the current location.
 *
 * `navigate('/x?y=1')` used to store the whole string as the path, so the
 * route table was asked about `/x?y=1` and answered NotFound.
 *
 * @param {string} to - absolute path, relative path, or full URL
 * @param {string} base - the current href
 * @returns {ClientLocation & { origin: string, href: string }}
 */
export function resolveLocation(to, base) {
  const url = new URL(String(to), base)
  return {
    origin: url.origin,
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash
  }
}

/** `pathname + search + hash`, what history.pushState is given. */
export function locationPath(location) {
  return `${location.pathname}${location.search}${location.hash}`
}

/**
 * Build the matcher for a route table: first match, in the table's order.
 *
 * @param {Array<{ path: string }>} routes
 * @returns {(pathname: string) => { route: any, params: Record<string, string> } | null}
 */
export function createMatcher(routes) {
  const compiled = routes.map(route => ({ route, matcher: compileRoute(route.path) }))

  return (pathname) => {
    for (const { route, matcher } of compiled) {
      let params
      try {
        params = matcher.match(pathname)
      } catch {
        // A malformed escape in the address bar: nothing can match it.
        return null
      }
      if (params) return { route, params }
    }
    return null
  }
}

/**
 * Where a route's guard sends this visitor, or null to render it.
 *
 * @param {{ auth?: boolean, guest?: boolean }} route
 * @param {any} user
 * @param {{ loginPath: string, homePath: string }} paths
 * @returns {string | null}
 */
export function guardRedirect(route, user, { loginPath, homePath }) {
  if (route.auth && !user) return loginPath
  if (route.guest && user) return homePath
  return null
}

/**
 * Whether a click on a Link should be handled by the router rather than the
 * browser. Modified clicks (new tab, new window, download), other buttons,
 * targets other than this frame and other origins are left to the browser.
 *
 * @param {{ button?: number, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, defaultPrevented?: boolean }} event
 * @param {{ target?: string, download?: any, origin: string, currentOrigin: string }} link
 * @returns {boolean}
 */
export function shouldHandleClick(event, link) {
  if (event.defaultPrevented) return false
  if ((event.button ?? 0) !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (link.target && link.target !== '_self') return false
  if (link.download !== undefined && link.download !== null && link.download !== false) return false
  return link.origin === link.currentOrigin
}

/**
 * The next query string for setSearchParams.
 *
 * @param {URLSearchParams | Record<string, string | string[] | number | boolean | null | undefined> | string | ((prev: URLSearchParams) => any)} next
 * @param {URLSearchParams} prev
 * @returns {string} `?a=1`, or '' when empty
 */
export function nextSearch(next, prev) {
  const value = typeof next === 'function' ? next(new URLSearchParams(prev)) : next
  let params

  if (value instanceof URLSearchParams || typeof value === 'string') {
    params = new URLSearchParams(value)
  } else {
    params = new URLSearchParams()
    for (const [key, v] of Object.entries(value ?? {})) {
      if (v === null || v === undefined) continue
      for (const item of Array.isArray(v) ? v : [v]) params.append(key, String(item))
    }
  }

  const search = params.toString()
  return search ? `?${search}` : ''
}
