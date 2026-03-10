import { useState, useEffect } from 'react'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('home')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch('/api/user', {
        headers: { Authorization: `Bearer ${token}` }
      })
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <nav className="flex justify-between items-center px-8 py-4 border-b border-dark-700">
        <span
          className="text-2xl font-bold cursor-pointer hover:text-gray-300 transition"
          onClick={() => setView('home')}
        >
          BasicBen
        </span>
        <div className="flex gap-4 items-center">
          {user ? (
            <>
              <span className="text-gray-400">Welcome, {user.name}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 border border-dark-600 rounded-lg hover:bg-dark-800 transition"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView('login')}
                className="px-4 py-2 border border-dark-600 rounded-lg hover:bg-dark-800 transition"
              >
                Login
              </button>
              <button
                onClick={() => setView('register')}
                className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition"
              >
                Register
              </button>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 flex justify-center items-center p-8">
        {view === 'home' && <HomePage user={user} />}
        {view === 'login' && <LoginForm setUser={setUser} setView={setView} />}
        {view === 'register' && <RegisterForm setUser={setUser} setView={setView} />}
      </main>

      <footer className="text-center py-8 text-gray-600 text-sm">
        <p>Built with BasicBen v0.1.0</p>
      </footer>
    </div>
  )
}

function HomePage({ user }) {
  return (
    <div className="text-center max-w-4xl">
      <h1 className="text-6xl font-bold bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent">
        BasicBen
      </h1>
      <p className="text-2xl text-gray-400 mt-2">A full-stack React framework</p>
      <p className="text-gray-500 mt-1">Minimal dependencies. Maximum clarity.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
        <Feature icon="⚡" title="Fast" desc="Vite-powered development" />
        <Feature icon="🔒" title="Secure" desc="JWT authentication built-in" />
        <Feature icon="🗄️" title="Database" desc="SQLite or Postgres" />
        <Feature icon="✨" title="Simple" desc="~3,700 lines of code" />
      </div>

      {user && (
        <div className="mt-12 p-8 bg-dark-800 rounded-xl border border-dark-700">
          <h2 className="text-xl font-semibold">Dashboard</h2>
          <p className="text-gray-400 mt-2">
            You're logged in as <strong className="text-white">{user.email}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

function Feature({ icon, title, desc }) {
  return (
    <div className="p-6 bg-dark-800 rounded-xl border border-dark-700 hover:border-dark-600 transition">
      <span className="text-3xl">{icon}</span>
      <h3 className="font-semibold mt-3">{title}</h3>
      <p className="text-gray-500 text-sm mt-1">{desc}</p>
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

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      localStorage.setItem('token', data.token)
      setUser(data.user)
      setView('home')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md p-8 bg-dark-800 rounded-xl border border-dark-700">
      <h2 className="text-2xl font-semibold text-center mb-6">Login</h2>

      {error && (
        <p className="text-red-400 text-center mb-4 p-3 bg-red-400/10 rounded-lg">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg focus:outline-none focus:border-gray-500 transition"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg focus:outline-none focus:border-gray-500 transition"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <p className="text-center mt-6 text-gray-500">
        Don't have an account?{' '}
        <button
          onClick={() => setView('register')}
          className="text-white underline hover:no-underline"
        >
          Register
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

      if (!res.ok) {
        setError(data.error || data.errors?.[Object.keys(data.errors)[0]]?.[0] || 'Registration failed')
        return
      }

      localStorage.setItem('token', data.token)
      setUser(data.user)
      setView('home')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md p-8 bg-dark-800 rounded-xl border border-dark-700">
      <h2 className="text-2xl font-semibold text-center mb-6">Register</h2>

      {error && (
        <p className="text-red-400 text-center mb-4 p-3 bg-red-400/10 rounded-lg">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg focus:outline-none focus:border-gray-500 transition"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg focus:outline-none focus:border-gray-500 transition"
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg focus:outline-none focus:border-gray-500 transition"
          required
          minLength={8}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>

      <p className="text-center mt-6 text-gray-500">
        Already have an account?{' '}
        <button
          onClick={() => setView('login')}
          className="text-white underline hover:no-underline"
        >
          Login
        </button>
      </p>
    </div>
  )
}

export default App
