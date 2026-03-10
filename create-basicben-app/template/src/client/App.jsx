import { useState, useEffect } from 'react'
import { ThemeContext } from './components/ThemeContext'
import { Button } from './components/Button'
import { NavLink } from './components/NavLink'
import { MobileMenu } from './components/MobileMenu'
import { Home } from './pages/Home'
import { Auth } from './pages/Auth'
import { Feed } from './pages/Feed'
import { FeedPost } from './pages/FeedPost'
import { Profile } from './pages/Profile'
import { Posts } from './pages/Posts'
import { PostForm } from './pages/PostForm'
import { GettingStarted } from './pages/GettingStarted'
import { api } from './api'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [viewData, setViewData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const t = dark
    ? { bg: 'bg-black', text: 'text-white', muted: 'text-white/50', subtle: 'text-white/30', border: 'border-white/10', card: 'bg-white/5', btn: 'bg-white text-black', btnHover: 'hover:bg-white/90', btnSecondary: 'bg-white/10 hover:bg-white/20' }
    : { bg: 'bg-white', text: 'text-black', muted: 'text-black/50', subtle: 'text-black/30', border: 'border-black/10', card: 'bg-black/5', btn: 'bg-black text-white', btnHover: 'hover:bg-black/90', btnSecondary: 'bg-black/10 hover:bg-black/20' }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-black' : 'bg-white'}`}>
        <div className={`w-5 h-5 border-2 rounded-full animate-spin ${dark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'}`} />
      </div>
    )
  }

  return (
    <ThemeContext.Provider value={{ t, dark }}>
      <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-purple-500/10' : 'bg-purple-500/5'}`} />
          <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-blue-500/10' : 'bg-blue-500/5'}`} />
        </div>

        <div className="relative max-w-3xl mx-auto px-6">
          <nav className={`flex items-center justify-between h-14 border-b ${t.border}`}>
            <button onClick={() => navigate('home')} className="font-semibold hover:opacity-70 transition">BasicBen</button>

            {/* Desktop Navigation */}
            <div className="hidden sm:flex items-center gap-2">
              <NavLink onClick={() => navigate('feed')}>Feed</NavLink>
              <NavLink onClick={() => navigate('gettingStarted')}>Docs</NavLink>

              {/* Separator */}
              <div className={`w-px h-5 mx-1 ${dark ? 'bg-white/20' : 'bg-black/20'}`} />

              <button
                onClick={() => setDark(!dark)}
                className={`p-2 rounded-lg ${t.card} transition`}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {user ? (
                <>
                  <NavLink onClick={() => navigate('posts')}>My Posts</NavLink>
                  <NavLink onClick={() => navigate('profile')}>Profile</NavLink>
                  <Button variant="secondary" onClick={logout} className="px-3 py-1.5">Log out</Button>
                </>
              ) : (
                <>
                  <NavLink onClick={() => navigate('login')}>Sign in</NavLink>
                  <Button onClick={() => navigate('register')} className="px-3 py-1.5">Get started</Button>
                </>
              )}
            </div>

            {/* Mobile Navigation */}
            <div className="flex sm:hidden items-center gap-2">
              <button
                onClick={() => setDark(!dark)}
                className={`p-2 rounded-lg ${t.card} transition`}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setMobileMenuOpen(true)}
                className={`p-2 rounded-lg ${t.card} transition`}
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </nav>

          <main className="py-8">
            {view === 'home' && <Home user={user} navigate={navigate} />}
            {view === 'login' && <Auth mode="login" setUser={setUser} navigate={navigate} />}
            {view === 'register' && <Auth mode="register" setUser={setUser} navigate={navigate} />}
            {view === 'feed' && <Feed navigate={navigate} />}
            {view === 'feedPost' && <FeedPost postId={viewData} navigate={navigate} />}
            {view === 'profile' && user && <Profile user={user} setUser={setUser} />}
            {view === 'posts' && user && <Posts navigate={navigate} />}
            {view === 'postForm' && user && <PostForm postId={viewData} navigate={navigate} />}
            {view === 'gettingStarted' && <GettingStarted />}
          </main>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <MobileMenu
            user={user}
            navigate={navigate}
            onClose={() => setMobileMenuOpen(false)}
            logout={logout}
          />
        )}
      </div>
    </ThemeContext.Provider>
  )
}

export default App
