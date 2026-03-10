import { useState, useEffect } from 'react'
import { ThemeContext, useTheme, Button, NavLink } from './components'
import { Home, Auth, Feed, FeedPost, Profile, Posts, PostForm } from './pages'
import { api } from './api'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [viewData, setViewData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)

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
            <div className="flex items-center gap-2">
              <NavLink onClick={() => navigate('feed')}>Feed</NavLink>
              <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg ${t.card} transition`}>{dark ? '☀️' : '🌙'}</button>
              {user ? (
                <>
                  <NavLink onClick={() => navigate('posts')} className="hidden sm:block">My Posts</NavLink>
                  <NavLink onClick={() => navigate('profile')} className="hidden sm:block">Profile</NavLink>
                  <Button variant="secondary" onClick={logout} className="px-3 py-1.5">Log out</Button>
                </>
              ) : (
                <>
                  <NavLink onClick={() => navigate('login')}>Sign in</NavLink>
                  <Button onClick={() => navigate('register')} className="px-3 py-1.5">Get started</Button>
                </>
              )}
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
          </main>
        </div>
      </div>
    </ThemeContext.Provider>
  )
}

export default App
