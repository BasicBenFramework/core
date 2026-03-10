import { useState, useEffect } from 'react'
import { AppProvider } from './contexts/AppContext'
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

const pages = {
  home: Home,
  login: Auth,
  register: Auth,
  feed: Feed,
  feedPost: FeedPost,
  profile: Profile,
  posts: Posts,
  postForm: PostForm,
  gettingStarted: GettingStarted,
  database: Database,
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

  const navigate = (v, data = null) => { setView(v); setViewData(data) }
  const logout = () => { localStorage.removeItem('token'); setUser(null); navigate('home') }

  if (loading) return <LoadingScreen />

  const PageComponent = pages[view]
  if (!PageComponent) return <LoadingScreen />

  const pageProps = getPageProps(view, { user, setUser, navigate, viewData })

  // Check if user is required for this view
  if ((view === 'profile' || view === 'posts' || view === 'postForm') && !user) {
    return <LoadingScreen />
  }

  const pageElement = <PageComponent {...pageProps} />

  return (
    <AppProvider value={{ user, setUser, navigate, logout, viewData, view }}>
      <RootLayout>
        {resolveLayout(PageComponent, pageElement)}
      </RootLayout>
    </AppProvider>
  )
}

export default App
