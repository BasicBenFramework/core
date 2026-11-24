import { useState, useEffect, useCallback, useMemo, createElement } from 'react'
import { RouterContext, AuthContext } from './context.js'
import { createMatcher, resolveLocation, locationPath, guardRedirect } from './location.js'

/**
 * A route entry: either the component itself, or the component plus its guards.
 *
 * @typedef {import('react').ComponentType<any> | {
 *   component: import('react').ComponentType<any>,
 *   auth?: boolean,
 *   guest?: boolean,
 *   layout?: import('react').ComponentType<any> | null
 * }} RouteDefinition
 */

/**
 * Create a client-side React app with routing
 *
 * @param {object} config
 * @param {Record<string, RouteDefinition>} config.routes - Route definitions { path: Component | { component, auth?, guest?, layout? } }
 * @param {import('react').ComponentType<any>} [config.layout] - Default layout wrapper
 * @param {(path: string) => Promise<any>} [config.api] - API function for the auth check; called
 *   with `authEndpoint`, resolves to `{ user }` (default: fetch with the stored bearer token)
 * @param {string | false} [config.authEndpoint] - Where the signed-in user is read from on
 *   load (default `/api/user`). `false` skips the check: nobody is signed in until
 *   `setUser` says so.
 * @param {string | false} [config.logoutEndpoint] - POSTed on logout so the server can end
 *   the session (default `/api/auth/logout`); `false` skips it
 * @param {string} [config.loginPath] - Where an `auth` route sends a signed-out visitor
 *   (default `/login`)
 * @param {string} [config.homePath] - Where a `guest` route sends a signed-in visitor
 *   (default `/`)
 * @param {import('react').ComponentType<any>} [config.Loading] - Loading component
 * @param {import('react').ComponentType<any>} [config.NotFound] - Component rendered when no route matches.
 *   Receives no props and is wrapped in the default layout, so an unmatched path
 *   keeps the site's navigation instead of rendering a bare string.
 * @param {import('react').ComponentType<{children: any}>} [config.provider] - Wraps the
 *   entire tree, outside the auth and router contexts. Use it for anything every
 *   route needs and that must survive navigation — a query client, a data
 *   cache, an error boundary.
 * @returns {import('react').FunctionComponent} React component
 */
export function createClientApp(config) {
  const {
    routes,
    layout: DefaultLayout,
    api,
    Loading,
    NotFound,
    provider: Provider,
    authEndpoint = '/api/user',
    logoutEndpoint = '/api/auth/logout',
    loginPath = '/login',
    homePath = '/'
  } = config

  // Normalize routes to consistent format
  const normalizedRoutes = Object.entries(routes).map(([path, value]) => {
    const isSimple = typeof value === 'function'
    return {
      path,
      component: isSimple ? value : value.component,
      auth: isSimple ? false : value.auth || false,
      guest: isSimple ? false : value.guest || false,
      layout: isSimple ? null : value.layout || null,
    }
  })

  // The same matcher the server uses: trailing slashes, literal dots and
  // decoded params all behave alike on both sides.
  const matchRoute = createMatcher(normalizedRoutes)

  const currentLocation = () => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash
  })

  const hasToken = () => {
    try {
      return Boolean(localStorage.getItem('token'))
    } catch {
      return false
    }
  }

  function App() {
    const [user, setUser] = useState(null)
    // Only waiting when there is something to check: signed out, the first
    // render is the real one, not a Loading flash.
    const [loading, setLoading] = useState(() => authEndpoint !== false && hasToken())
    const [location, setLocation] = useState(currentLocation)

    // Navigate function. Takes a path with or without a query string and
    // hash, or a full URL; another origin is a full page load.
    const navigate = useCallback((to, options = {}) => {
      const { replace = false } = options
      const next = resolveLocation(to, window.location.href)

      if (next.origin !== window.location.origin) {
        window.location.assign(next.href)
        return
      }

      const target = locationPath(next)
      if (replace) {
        window.history.replaceState({}, '', target)
      } else {
        window.history.pushState({}, '', target)
      }

      setLocation({ pathname: next.pathname, search: next.search, hash: next.hash })
      if (!next.hash) window.scrollTo(0, 0)
    }, [])

    // Logout function
    const logout = useCallback(() => {
      // Tell the server before forgetting the token, so an app that revokes
      // sessions can end this one rather than leaving a copy valid until it
      // expires. Fire-and-forget: signing out locally must not wait on, or
      // fail with, the network.
      const token = localStorage.getItem('token')
      if (token && logoutEndpoint !== false) {
        fetch(logoutEndpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true
        }).catch(() => {})
      }
      localStorage.removeItem('token')
      setUser(null)
      navigate(homePath)
    }, [navigate])

    // Auth check on mount
    useEffect(() => {
      if (authEndpoint === false || !hasToken()) {
        setLoading(false)
        return
      }

      const checkAuth = api || defaultApi
      checkAuth(authEndpoint)
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    }, [])

    // Handle browser back/forward
    useEffect(() => {
      const handlePopState = () => {
        setLocation(currentLocation())
      }
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    // Find matching route
    const matched = matchRoute(location.pathname)

    // A guard decides during render but redirects after it. Navigating from
    // render updated state mid-render, which React warns about and which runs
    // twice under StrictMode.
    const redirect = !loading && matched ? guardRedirect(matched.route, user, { loginPath, homePath }) : null

    useEffect(() => {
      if (redirect) navigate(redirect, { replace: true })
    }, [redirect, navigate])

    const routerValue = useMemo(() => ({
      path: location.pathname,
      search: location.search,
      hash: location.hash,
      params: matched?.params ?? {},
      navigate
    }), [location, matched?.route, navigate])

    // Loading state
    if (loading) {
      if (Loading) return createElement(Loading)
      return createElement('div', {
        style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }
      }, 'Loading...')
    }

    let wrapped

    if (!matched) {
      if (!NotFound) {
        return createElement('div', null, '404 - Not Found')
      }
      // Falls through to the providers below rather than returning here, so the
      // page and its layout can use useAuth/useNavigate/usePath like any other.
      wrapped = createElement(NotFound)
      if (DefaultLayout) {
        wrapped = createElement(DefaultLayout, null, wrapped)
      }
    } else {
      // Redirecting: render nothing until the effect above has moved on.
      if (redirect) return null

      const { route } = matched
      wrapped = createElement(route.component)

      // Route-specific layout replaces the default
      const Layout = route.layout || DefaultLayout
      if (Layout) {
        wrapped = createElement(Layout, null, wrapped)
      }
    }

    // Provide context
    const tree = createElement(
      AuthContext.Provider,
      { value: { user, setUser, logout, loading } },
      createElement(
        RouterContext.Provider,
        { value: routerValue },
        wrapped
      )
    )

    // An app-supplied wrapper goes outside both, so anything it provides is
    // available to every route and every layout — a store, a query
    // client, an error boundary. Outside rather than inside because a provider
    // that only covered the matched route would remount on every navigation.
    return Provider ? createElement(Provider, null, tree) : tree
  }

  return App
}

/**
 * Default API function
 */
async function defaultApi(path) {
  const token = localStorage.getItem('token')
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}
