import { useState, useEffect } from 'react'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [loading, setLoading] = useState(true)

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
    return <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 -left-32 w-64 h-64 bg-blue-500/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6">
        <nav className="flex items-center justify-between h-14 border-b border-white/5">
          <button onClick={() => setView('home')} className="font-semibold hover:opacity-70 transition">
            BasicBen
          </button>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-sm text-white/40">{user.email}</span>
                <button onClick={() => { localStorage.removeItem('token'); setUser(null) }}
                  className="text-sm px-3 py-1.5 rounded-full hover:bg-white/5 transition">
                  Log out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setView('login')} className="text-sm text-white/60 hover:text-white transition">
                  Sign in
                </button>
                <button onClick={() => setView('register')}
                  className="text-sm px-3 py-1.5 bg-white text-black rounded-full font-medium hover:bg-white/90 transition">
                  Get started
                </button>
              </>
            )}
          </div>
        </nav>

        <main className="py-16">
          {view === 'home' && <Home user={user} />}
          {view === 'login' && <Auth mode="login" setUser={setUser} setView={setView} />}
          {view === 'register' && <Auth mode="register" setUser={setUser} setView={setView} />}
        </main>
      </div>
    </div>
  )
}

function Home({ user }) {
  return (
    <div className="space-y-16">
      <section className="text-center py-12">
        <p className="text-xs text-white/40 mb-4 tracking-wide uppercase">Now in beta</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Build faster with{' '}
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">BasicBen</span>
        </h1>
        <p className="text-white/50 max-w-md mx-auto mb-6">
          Full-stack React framework. Minimal dependencies. Everything you need.
        </p>
        <div className="flex justify-center gap-3">
          <button className="px-4 py-2 bg-white text-black text-sm font-medium rounded-full hover:bg-white/90 transition">
            Get started
          </button>
          <code className="px-4 py-2 bg-white/5 border border-white/10 text-sm rounded-full text-white/60">
            npx create-basicben-app
          </code>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['⚡', 'Vite Powered', 'Fast HMR & builds'],
          ['🔐', 'Auth Built-in', 'JWT ready to go'],
          ['🗄️', 'Database', 'SQLite or Postgres'],
          ['🪶', '3.7k Lines', 'Small & auditable'],
        ].map(([icon, title, desc]) => (
          <div key={title} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
            <span className="text-xl">{icon}</span>
            <p className="font-medium text-sm mt-2">{title}</p>
            <p className="text-xs text-white/40 mt-0.5">{desc}</p>
          </div>
        ))}
      </section>

      {user && (
        <section className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-medium">
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-sm">{user.name}</p>
              <p className="text-xs text-white/40">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[['Status', 'Active'], ['Plan', 'Free'], ['API Calls', '0']].map(([k, v]) => (
              <div key={k} className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-white/40">{k}</p>
                <p className="font-medium text-sm">{v}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 h-8 bg-white/5 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <span className="ml-2 text-xs text-white/30">routes/api.js</span>
        </div>
        <pre className="p-4 text-xs leading-relaxed text-white/60 overflow-x-auto">
{`export default (router) => {
  router.get('/api/users', UserController.index)
  router.post('/api/users', auth, UserController.create)
}`}
        </pre>
      </section>

      <p className="text-center text-xs text-white/20">BasicBen v0.1.0</p>
    </div>
  )
}

function Auth({ mode, setUser, setView }) {
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
    <div className="max-w-xs mx-auto py-12">
      <h1 className="text-2xl font-bold text-center mb-1">{isLogin ? 'Welcome back' : 'Create account'}</h1>
      <p className="text-sm text-white/40 text-center mb-6">{isLogin ? 'Sign in to continue' : 'Get started for free'}</p>

      {error && <p className="text-xs text-red-400 text-center mb-4 p-2 bg-red-500/10 rounded-lg">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        {!isLogin && (
          <input type="text" placeholder="Name" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/20" />
        )}
        <input type="email" placeholder="Email" required value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/20" />
        <input type="password" placeholder="Password" required minLength={8} value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/20" />
        <button type="submit" disabled={loading}
          className="w-full py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 transition">
          {loading ? '...' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-xs text-white/40 text-center mt-4">
        {isLogin ? "Don't have an account? " : 'Have an account? '}
        <button onClick={() => setView(isLogin ? 'register' : 'login')} className="text-white hover:underline">
          {isLogin ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}

export default App
