import { useContext, useMemo, useCallback, createElement } from 'react'
import { RouterContext, AuthContext } from './context.js'
import { nextSearch, shouldHandleClick } from './location.js'

/**
 * Access auth state and methods
 *
 * The user record is whatever the auth endpoint returns, so its shape is the
 * application's to declare: `useAuth<User>()` types it, and calling with no
 * type argument leaves it unconstrained rather than wrong.
 *
 * @template [T=any] the application's user record
 * @returns {{ user: T|null, setUser: (user: T|null) => void, logout: () => void, loading: boolean }}
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within createClientApp')
  }
  return context
}

/**
 * Get navigation function
 * @returns {(to: string, options?: { replace?: boolean }) => void} navigate(path, options)
 */
export function useNavigate() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useNavigate must be used within createClientApp')
  }
  return context.navigate
}

/**
 * Get current route params
 * @returns {Record<string, string>} params object (e.g. { id: '123' })
 */
export function useParams() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useParams must be used within createClientApp')
  }
  return context.params
}

/**
 * Get current path, without the query string or hash
 * @returns {string} current pathname
 */
export function usePath() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('usePath must be used within createClientApp')
  }
  return context.path
}

/**
 * The query string, and a setter that navigates to a new one.
 *
 * The setter takes a URLSearchParams, a string, an object (an array value
 * repeats the key; null and undefined drop it), or a function of the current
 * params. The path and hash stay; `{ replace: true }` replaces the history
 * entry instead of adding one.
 *
 * @example
 * const [params, setParams] = useSearchParams()
 * const page = Number(params.get('page') ?? 1)
 * setParams(prev => { prev.set('page', String(page + 1)); return prev })
 *
 * @returns {[URLSearchParams, (next: URLSearchParams | string | Record<string, any> | ((prev: URLSearchParams) => any), options?: { replace?: boolean }) => void]}
 */
export function useSearchParams() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useSearchParams must be used within createClientApp')
  }

  const { path, search, navigate } = context
  const params = useMemo(() => new URLSearchParams(search), [search])
  const setParams = useCallback((next, options = {}) => {
    navigate(`${path}${nextSearch(next, new URLSearchParams(search))}`, options)
  }, [path, search, navigate])

  return [params, setParams]
}

/**
 * Get the current query string
 * @returns {string} `?a=1`, or ''
 */
export function useSearch() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useSearch must be used within createClientApp')
  }
  return context.search
}

/**
 * A link that navigates through the client router.
 *
 * Renders a real `<a href>`, so it can be opened in a new tab, copied and
 * crawled. A plain left click on a same-origin link navigates without a page
 * load; modified clicks, `target` other than `_self`, `download` and other
 * origins are left to the browser. An `onClick` that calls preventDefault()
 * stops the navigation.
 *
 * @param {{ to: string, replace?: boolean, onClick?: (event: any) => void, children?: any, [prop: string]: any }} props
 */
export function Link({ to, replace = false, onClick, children, ...rest }) {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('Link must be used within createClientApp')
  }
  const { navigate } = context

  const handleClick = (event) => {
    if (onClick) onClick(event)

    const href = event.currentTarget?.href ?? to
    let origin
    try {
      origin = new URL(href, window.location.href).origin
    } catch {
      return
    }

    const handled = shouldHandleClick(event, {
      target: rest.target,
      download: rest.download,
      origin,
      currentOrigin: window.location.origin
    })
    if (!handled) return

    event.preventDefault()
    navigate(to, { replace })
  }

  return createElement('a', { ...rest, href: to, onClick: handleClick }, children)
}
