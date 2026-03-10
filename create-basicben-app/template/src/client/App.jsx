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

  const handleLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setView('home')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#000] text-white antialiased">
      {/* Gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/30 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/20 rounded-full blur-[128px]" />
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-emerald-500/20 rounded-full blur-[128px]" />
      </div>

      <div className="relative">
        <Nav user={user} setView={setView} handleLogout={handleLogout} />

        <main className="max-w-6xl mx-auto px-6 py-20">
          {view === 'home' && <HomePage user={user} />}
          {view === 'login' && <LoginForm setUser={setUser} setView={setView} />}
          {view === 'register' && <RegisterForm setUser={setUser} setView={setView} />}
        </main>
      </div>
    </div>
  )
}

function Nav({ user, setView, handleLogout }) {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => setView('home')}
          className="text-xl font-semibold tracking-tight hover:opacity-70 transition-opacity"
        >
          BasicBen
        </button>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView('login')}
                className="text-sm px-4 py-2 text-white/70 hover:text-white transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => setView('register')}
                className="text-sm px-4 py-2 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-all"
              >
                Get started
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

function HomePage({ user }) {
  return (
    <div className="space-y-32">
      {/* Hero */}
      <section className="text-center pt-20 pb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Now in public beta
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Build faster with
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            BasicBen
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10">
          A full-stack React framework with minimal dependencies.
          Everything you need, nothing you don't.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-all">
            Get started
          </button>
          <button className="px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2">
            <span className="font-mono text-sm">npx create-basicben-app</span>
          </button>
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon="⚡"
            title="Vite Powered"
            description="Lightning fast HMR and builds with modern tooling"
          />
          <FeatureCard
            icon="🔐"
            title="Auth Built-in"
            description="JWT authentication ready out of the box"
          />
          <FeatureCard
            icon="🗄️"
            title="Database Ready"
            description="SQLite default, Postgres when you scale"
          />
          <FeatureCard
            icon="🪶"
            title="~3,700 Lines"
            description="Small, auditable, maintainable codebase"
          />
        </div>
      </section>

      {/* Dashboard for logged in users */}
      {user && (
        <section className="rounded-2xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold">{user.name}</h2>
              <p className="text-sm text-white/50">{user.email}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Status" value="Active" />
            <StatCard label="Plan" value="Free" />
            <StatCard label="API Calls" value="0" />
          </div>
        </section>
      )}

      {/* Code preview */}
      <section className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 bg-white/5 border-b border-white/10">
          <div className="w-3 h-3 rounded-full bg-white/20" />
          <div className="w-3 h-3 rounded-full bg-white/20" />
          <div className="w-3 h-3 rounded-full bg-white/20" />
          <span className="ml-4 text-sm text-white/40">src/routes/api.js</span>
        </div>
        <pre className="p-6 text-sm leading-relaxed overflow-x-auto">
          <code className="text-white/70">
            <span className="text-purple-400">export default</span> <span className="text-white/40">(</span>router<span className="text-white/40">)</span> <span className="text-purple-400">=&gt;</span> <span className="text-white/40">{'{'}</span>{'\n'}
            {'  '}router.<span className="text-emerald-400">get</span><span className="text-white/40">(</span><span className="text-orange-300">'/api/users'</span>, UserController.index<span className="text-white/40">)</span>{'\n'}
            {'  '}router.<span className="text-emerald-400">post</span><span className="text-white/40">(</span><span className="text-orange-300">'/api/users'</span>, auth, UserController.create<span className="text-white/40">)</span>{'\n'}
            <span className="text-white/40">{'}'}</span>
          </code>
        </pre>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-white/30 pb-10">
        Built with BasicBen v0.1.0
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="group p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] hover:border-white/20 transition-all">
      <span className="text-3xl">{icon}</span>
      <h3 className="font-semibold mt-4 mb-2">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="p-4 rounded-xl bg-white/5">
      <p className="text-sm text-white/50 mb-1">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}

function LoginForm({ setUser, setView }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')

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
    <div className="max-w-sm mx-auto pt-20">
      <h1 className="text-3xl font-bold text-center mb-2">Welcome back</h1>
      <p className="text-white/50 text-center mb-8">Sign in to your account</p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 transition-all"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center mt-6 text-white/50 text-sm">
        Don't have an account?{' '}
        <button onClick={() => setView('register')} className="text-white hover:underline">
          Sign up
        </button>
      </p>
    </div>
  )
}

function RegisterForm({ setUser, setView }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.errors?.[Object.keys(data.errors)[0]]?.[0] || 'Registration failed')

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
    <div className="max-w-sm mx-auto pt-20">
      <h1 className="text-3xl font-bold text-center mb-2">Create account</h1>
      <p className="text-white/50 text-center mb-8">Get started for free</p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          required
          minLength={8}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 transition-all"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center mt-6 text-white/50 text-sm">
        Already have an account?{' '}
        <button onClick={() => setView('login')} className="text-white hover:underline">
          Sign in
        </button>
      </p>
    </div>
  )
}

export default App
