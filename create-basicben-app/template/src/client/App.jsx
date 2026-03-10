import { useState, useEffect, useCallback } from 'react'
import { AppProvider } from './contexts/AppContext'
import { ToastProvider } from './contexts/ToastContext'
import { RootLayout } from './layouts/RootLayout'
import { Home } from './pages/Home'
import { Auth } from './pages/Auth'
import { Feed } from './pages/Feed'
import { FeedPost } from './pages/FeedPost'
import { Profile } from './pages/Profile'
import { Posts } from './pages/Posts'
import { PostForm } from './pages/PostForm'
import { GettingStarted } from './pages/GettingStarted'
import { Database } from './pages/Database'
import { api } from './api'

// Route configuration with guards
const routes = {
  '/': { view: 'home', component: Home },
  '/login': { view: 'login', component: Auth, guest: true },
  '/register': { view: 'register', component: Auth, guest: true },
  '/feed': { view: 'feed', component: Feed },
  '/feed/:id': { view: 'feedPost', component: FeedPost },
  '/profile': { view: 'profile', component: Profile, auth: true },
  '/posts': { view: 'posts', component: Posts, auth: true },
  '/posts/new': { view: 'postForm', component: PostForm, auth: true },
  '/posts/:id/edit': { view: 'postForm', component: PostForm, auth: true },
  '/docs': { view: 'gettingStarted', component: GettingStarted },
  '/docs/database': { view: 'database', component: Database },
}

// Map view names to URL paths
const viewToPath = {
  home: '/',
  login: '/login',
  register: '/register',
  feed: '/feed',
  feedPost: (id) => `/feed/${id}`,
  profile: '/profile',
  posts: '/posts',
  postForm: (id) => id ? `/posts/${id}/edit` : '/posts/new',
  gettingStarted: '/docs',
  database: '/docs/database',
}

function parseUrl(pathname) {
  // Try exact match first
  if (routes[pathname]) {
    return { ...routes[pathname], params: {} }
  }

  // Try pattern matching
  for (const [pattern, config] of Object.entries(routes)) {
    const paramMatch = pattern.match(/:(\w+)/g)
    if (!paramMatch) continue

    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$')
    const match = pathname.match(regex)
    if (match) {
      const params = {}
      paramMatch.forEach((param, i) => {
        params[param.slice(1)] = match[i + 1]
      })
      return { ...config, params }
    }
  }

  return { view: 'home', component: Home, params: {} }
}

function resolveLayout(PageComponent, pageElement) {
  const layout = PageComponent.layout
  if (!layout) return pageElement
  if (Array.isArray(layout)) {
    return layout.reduceRight((acc, fn) => fn(acc), pageElement)
  }
  return layout(pageElement)
}

function getPageProps(view, context) {
  const { user, setUser, navigate, viewData } = context
  switch (view) {
    case 'home':
      return { user, navigate }
    case 'login':
      return { mode: 'login', setUser, navigate }
    case 'register':
      return { mode: 'register', setUser, navigate }
    case 'feed':
      return { navigate }
    case 'feedPost':
      return { postId: viewData, navigate }
    case 'profile':
      return { user, setUser }
    case 'posts':
      return { navigate }
    case 'postForm':
      return { postId: viewData, navigate }
    case 'gettingStarted':
    case 'database':
      return {}
    default:
      return {}
  }
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-5 h-5 border-2 rounded-full animate-spin border-white/20 border-t-white" />
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [viewData, setViewData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [currentRoute, setCurrentRoute] = useState(null)

  // Initialize from URL on mount
  useEffect(() => {
    const { view, params } = parseUrl(window.location.pathname)
    setView(view)
    setViewData(params.id || null)
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const { view, params } = parseUrl(window.location.pathname)
      setTransitioning(true)
      setTimeout(() => {
        setView(view)
        setViewData(params.id || null)
        setTransitioning(false)
      }, 150)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api('/api/user')
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Route guards effect
  useEffect(() => {
    if (loading) return

    const route = Object.values(routes).find(r => r.view === view)
    if (!route) return

    // Protected route - redirect to login
    if (route.auth && !user) {
      navigateInternal('login', null, true)
      return
    }

    // Guest-only route - redirect to home if logged in
    if (route.guest && user) {
      navigateInternal('home', null, true)
      return
    }

    setCurrentRoute(route)
  }, [view, user, loading])

  const navigateInternal = useCallback((v, data = null, replace = false) => {
    // Build the URL path
    let path = viewToPath[v]
    if (typeof path === 'function') {
      path = path(data)
    }

    // Update browser history
    if (replace) {
      window.history.replaceState({ view: v, data }, '', path)
    } else {
      window.history.pushState({ view: v, data }, '', path)
    }

    // Animate transition
    setTransitioning(true)
    setTimeout(() => {
      setView(v)
      setViewData(data)
      setTransitioning(false)
      // Scroll to top on navigation
      window.scrollTo(0, 0)
    }, 150)
  }, [])

  const navigate = useCallback((v, data = null) => {
    navigateInternal(v, data, false)
  }, [navigateInternal])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
    navigate('home')
  }, [navigate])

  if (loading) return <LoadingScreen />

  const PageComponent = Object.values(routes).find(r => r.view === view)?.component || Home
  const pageProps = getPageProps(view, { user, setUser, navigate, viewData })
  const pageElement = <PageComponent {...pageProps} />

  return (
    <ToastProvider>
      <AppProvider value={{ user, setUser, navigate, logout, viewData, view, transitioning }}>
        <RootLayout>
          <div className={`transition-opacity duration-150 ${transitioning ? 'opacity-0' : 'opacity-100'}`}>
            {resolveLayout(PageComponent, pageElement)}
          </div>
        </RootLayout>
      </AppProvider>
    </ToastProvider>
  )
}

export default App
