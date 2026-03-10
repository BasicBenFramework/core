import { useState, useEffect } from 'react'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch('/api/user', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-black' : 'bg-white'}`}>
      <div className={`w-5 h-5 border-2 rounded-full animate-spin ${dark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'}`} />
    </div>
  }

  const t = dark
    ? { bg: 'bg-black', text: 'text-white', muted: 'text-white/50', subtle: 'text-white/30', border: 'border-white/10', card: 'bg-white/5', btn: 'bg-white text-black', btnHover: 'hover:bg-white/90' }
    : { bg: 'bg-white', text: 'text-black', muted: 'text-black/50', subtle: 'text-black/30', border: 'border-black/10', card: 'bg-black/5', btn: 'bg-black text-white', btnHover: 'hover:bg-black/90' }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-purple-500/10' : 'bg-purple-500/5'}`} />
        <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-blue-500/10' : 'bg-blue-500/5'}`} />
      </div>

      <div className="relative max-w-3xl mx-auto px-6">
        <nav className={`flex items-center justify-between h-14 border-b ${t.border}`}>
          <button onClick={() => setView('home')} className="font-semibold hover:opacity-70 transition">
            BasicBen
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg ${t.card} transition`}>
              {dark ? '☀️' : '🌙'}
            </button>
            {user ? (
              <>
                <span className={`text-sm ${t.muted} hidden sm:block`}>{user.email}</span>
                <button onClick={() => { localStorage.removeItem('token'); setUser(null) }}
                  className={`text-sm px-3 py-1.5 rounded-full ${t.card} transition`}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setView('login')} className={`text-sm ${t.muted} hover:opacity-70 transition`}>
                  Sign in
                </button>
                <button onClick={() => setView('register')}
                  className={`text-sm px-3 py-1.5 rounded-full font-medium ${t.btn} ${t.btnHover} transition`}>
                  Get started
                </button>
              </>
            )}
          </div>
        </nav>

        <main className="py-16">
          {view === 'home' && <Home user={user} t={t} dark={dark} />}
          {view === 'login' && <Auth mode="login" setUser={setUser} setView={setView} t={t} />}
          {view === 'register' && <Auth mode="register" setUser={setUser} setView={setView} t={t} />}
        </main>
      </div>
    </div>
  )
}

function Home({ user, t, dark }) {
  return (
    <div className="space-y-12">
      <section className="text-center py-8">
        <p className={`text-xs ${t.subtle} mb-3 tracking-wide uppercase`}>Now in beta</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
          Build faster with <span className="underline decoration-2 underline-offset-4">BasicBen</span>
        </h1>
        <p className={`${t.muted} max-w-md mx-auto mb-6`}>
          Full-stack React framework. Minimal dependencies.
        </p>
        <div className="flex justify-center gap-3">
          <button className={`px-4 py-2 text-sm font-medium rounded-full ${t.btn} ${t.btnHover} transition`}>
            Get started
          </button>
          <code className={`px-4 py-2 text-sm rounded-full ${t.card} ${t.muted} border ${t.border}`}>
            npx create-basicben-app
          </code>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['⚡', 'Vite', 'Fast builds'],
          ['🔐', 'Auth', 'JWT ready'],
          ['🗄️', 'Database', 'SQL built-in'],
          ['🪶', 'Tiny', '3.7k lines'],
        ].map(([icon, title, desc]) => (
          <div key={title} className={`p-4 rounded-xl ${t.card} border ${t.border} hover:border-opacity-50 transition`}>
            <span className="text-lg">{icon}</span>
            <p className="font-medium text-sm mt-2">{title}</p>
            <p className={`text-xs ${t.subtle} mt-0.5`}>{desc}</p>
          </div>
        ))}
      </section>

      {user && (
        <section className={`p-4 rounded-xl ${t.card} border ${t.border}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${dark ? 'bg-white text-black' : 'bg-black text-white'}`}>
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-sm">{user.name}</p>
              <p className={`text-xs ${t.subtle}`}>{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['Status', 'Active'], ['Plan', 'Free'], ['Calls', '0']].map(([k, v]) => (
              <div key={k} className={`p-2 rounded-lg ${dark ? 'bg-white/5' : 'bg-black/5'}`}>
                <p className={`text-xs ${t.subtle}`}>{k}</p>
                <p className="font-medium text-sm">{v}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`rounded-xl ${t.card} border ${t.border} overflow-hidden`}>
        <div className={`flex items-center gap-1.5 px-3 h-8 border-b ${t.border}`}>
          <div className={`w-2 h-2 rounded-full ${dark ? 'bg-white/20' : 'bg-black/20'}`} />
          <div className={`w-2 h-2 rounded-full ${dark ? 'bg-white/20' : 'bg-black/20'}`} />
          <div className={`w-2 h-2 rounded-full ${dark ? 'bg-white/20' : 'bg-black/20'}`} />
          <span className={`ml-2 text-xs ${t.subtle}`}>routes/api.js</span>
        </div>
        <pre className="p-4 text-xs leading-relaxed overflow-x-auto">
          <code>
            <span className="text-purple-400">export default</span> <span className={t.muted}>(router)</span> <span className="text-purple-400">=&gt;</span> <span className={t.subtle}>{'{'}</span>{'\n'}
            {'  '}router.<span className="text-emerald-400">get</span><span className={t.subtle}>(</span><span className="text-amber-400">'/users'</span>, UserController.index<span className={t.subtle}>)</span>{'\n'}
            {'  '}router.<span className="text-emerald-400">post</span><span className={t.subtle}>(</span><span className="text-amber-400">'/users'</span>, auth, UserController.create<span className={t.subtle}>)</span>{'\n'}
            <span className={t.subtle}>{'}'}</span>
          </code>
        </pre>
      </section>

      <p className={`text-center text-xs ${t.subtle}`}>BasicBen v0.1.0</p>
    </div>
  )
}

function Auth({ mode, setUser, setView, t }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLogin ? { email: form.email, password: form.password } : form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || Object.values(data.errors || {})[0]?.[0] || 'Failed')
      localStorage.setItem('token', data.token)
      setUser(data.user)
      setView('home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xs mx-auto py-8">
      <h1 className="text-2xl font-bold text-center mb-1">{isLogin ? 'Welcome back' : 'Create account'}</h1>
      <p className={`text-sm ${t.muted} text-center mb-6`}>{isLogin ? 'Sign in to continue' : 'Get started for free'}</p>

      {error && <p className="text-xs text-red-500 text-center mb-4 p-2 bg-red-500/10 rounded-lg">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        {!isLogin && (
          <input type="text" placeholder="Name" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} placeholder:${t.subtle} focus:outline-none`} />
        )}
        <input type="email" placeholder="Email" required value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} placeholder:${t.subtle} focus:outline-none`} />
        <input type="password" placeholder="Password" required minLength={8} value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} placeholder:${t.subtle} focus:outline-none`} />
        <button type="submit" disabled={loading}
          className={`w-full py-2 text-sm font-medium rounded-lg ${t.btn} ${t.btnHover} disabled:opacity-50 transition`}>
          {loading ? '...' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className={`text-xs ${t.muted} text-center mt-4`}>
        {isLogin ? "Don't have an account? " : 'Have an account? '}
        <button onClick={() => setView(isLogin ? 'register' : 'login')} className="underline hover:no-underline">
          {isLogin ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}

export default App
