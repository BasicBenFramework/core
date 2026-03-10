import { useState, useEffect } from 'react'

const api = async (path, options = {}) => {
  const token = localStorage.getItem('token')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || Object.values(data.errors || {})[0]?.[0] || 'Failed')
  return data
}

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

  if (loading) {
    return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-black' : 'bg-white'}`}>
      <div className={`w-5 h-5 border-2 rounded-full animate-spin ${dark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'}`} />
    </div>
  }

  const t = dark
    ? { bg: 'bg-black', text: 'text-white', muted: 'text-white/50', subtle: 'text-white/30', border: 'border-white/10', card: 'bg-white/5', btn: 'bg-white text-black', btnHover: 'hover:bg-white/90', btnSecondary: 'bg-white/10 hover:bg-white/20' }
    : { bg: 'bg-white', text: 'text-black', muted: 'text-black/50', subtle: 'text-black/30', border: 'border-black/10', card: 'bg-black/5', btn: 'bg-black text-white', btnHover: 'hover:bg-black/90', btnSecondary: 'bg-black/10 hover:bg-black/20' }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-purple-500/10' : 'bg-purple-500/5'}`} />
        <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[150px] ${dark ? 'bg-blue-500/10' : 'bg-blue-500/5'}`} />
      </div>

      <div className="relative max-w-3xl mx-auto px-6">
        <nav className={`flex items-center justify-between h-14 border-b ${t.border}`}>
          <button onClick={() => navigate('home')} className="font-semibold hover:opacity-70 transition">
            BasicBen
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('feed')} className={`text-sm ${t.muted} hover:opacity-70 transition`}>Feed</button>
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg ${t.card} transition`}>
              {dark ? '☀️' : '🌙'}
            </button>
            {user ? (
              <>
                <button onClick={() => navigate('posts')} className={`text-sm ${t.muted} hover:opacity-70 transition hidden sm:block`}>My Posts</button>
                <button onClick={() => navigate('profile')} className={`text-sm ${t.muted} hover:opacity-70 transition hidden sm:block`}>Profile</button>
                <button onClick={logout} className={`text-sm px-3 py-1.5 rounded-full ${t.card} transition`}>Log out</button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('login')} className={`text-sm ${t.muted} hover:opacity-70 transition`}>Sign in</button>
                <button onClick={() => navigate('register')} className={`text-sm px-3 py-1.5 rounded-full font-medium ${t.btn} ${t.btnHover} transition`}>Get started</button>
              </>
            )}
          </div>
        </nav>

        <main className="py-8">
          {view === 'home' && <Home user={user} t={t} dark={dark} navigate={navigate} />}
          {view === 'login' && <Auth mode="login" setUser={setUser} navigate={navigate} t={t} />}
          {view === 'register' && <Auth mode="register" setUser={setUser} navigate={navigate} t={t} />}
          {view === 'feed' && <Feed t={t} dark={dark} navigate={navigate} />}
          {view === 'feedPost' && <FeedPost postId={viewData} t={t} dark={dark} navigate={navigate} />}
          {view === 'profile' && user && <Profile user={user} setUser={setUser} t={t} dark={dark} />}
          {view === 'posts' && user && <Posts t={t} dark={dark} navigate={navigate} />}
          {view === 'postForm' && user && <PostForm postId={viewData} t={t} navigate={navigate} />}
        </main>
      </div>
    </div>
  )
}

function Home({ user, t, dark, navigate }) {
  return (
    <div className="space-y-12 py-8">
      <section className="text-center">
        <p className={`text-xs ${t.subtle} mb-3 tracking-wide uppercase`}>Now in beta</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
          Build faster with <span className="underline decoration-2 underline-offset-4">BasicBen</span>
        </h1>
        <p className={`${t.muted} max-w-md mx-auto mb-6`}>Full-stack React framework. Minimal dependencies.</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate('feed')} className={`px-4 py-2 text-sm font-medium rounded-full ${t.btn} ${t.btnHover} transition`}>View Feed</button>
          <code className={`px-4 py-2 text-sm rounded-full ${t.card} ${t.muted} border ${t.border}`}>npx create-basicben-app</code>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['⚡', 'Vite', 'Fast builds'], ['🔐', 'Auth', 'JWT ready'], ['🗄️', 'Database', 'SQL built-in'], ['🪶', 'Tiny', '3.7k lines']].map(([icon, title, desc]) => (
          <div key={title} className={`p-4 rounded-xl ${t.card} border ${t.border} hover:border-opacity-50 transition`}>
            <span className="text-lg">{icon}</span>
            <p className="font-medium text-sm mt-2">{title}</p>
            <p className={`text-xs ${t.subtle} mt-0.5`}>{desc}</p>
          </div>
        ))}
      </section>

      {user && (
        <section className={`p-4 rounded-xl ${t.card} border ${t.border}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${dark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                {user.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-sm">{user.name}</p>
                <p className={`text-xs ${t.subtle}`}>{user.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate('posts')} className={`text-xs px-3 py-1.5 rounded-full ${t.btnSecondary} transition`}>My Posts</button>
              <button onClick={() => navigate('profile')} className={`text-xs px-3 py-1.5 rounded-full ${t.btnSecondary} transition`}>Profile</button>
            </div>
          </div>
        </section>
      )}

      <p className={`text-center text-xs ${t.subtle}`}>BasicBen v0.1.0</p>
    </div>
  )
}

function Auth({ mode, setUser, navigate, t }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(isLogin ? { email: form.email, password: form.password } : form)
      })
      localStorage.setItem('token', data.token)
      setUser(data.user)
      navigate('home')
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
        {!isLogin && <input type="text" placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />}
        <input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <input type="password" placeholder="Password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <button type="submit" disabled={loading} className={`w-full py-2 text-sm font-medium rounded-lg ${t.btn} ${t.btnHover} disabled:opacity-50 transition`}>{loading ? '...' : isLogin ? 'Sign in' : 'Create account'}</button>
      </form>
      <p className={`text-xs ${t.muted} text-center mt-4`}>
        {isLogin ? "Don't have an account? " : 'Have an account? '}
        <button onClick={() => navigate(isLogin ? 'register' : 'login')} className="underline hover:no-underline">{isLogin ? 'Sign up' : 'Sign in'}</button>
      </p>
    </div>
  )
}

function Feed({ t, dark, navigate }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/feed').then(data => setPosts(data.posts)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={`text-center ${t.muted} py-12`}>Loading...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Feed</h1>
      {posts.length === 0 ? (
        <p className={`text-center ${t.muted} py-12`}>No posts yet</p>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <button key={post.id} onClick={() => navigate('feedPost', post.id)} className={`w-full text-left p-4 rounded-xl ${t.card} border ${t.border} hover:border-opacity-50 transition`}>
              <h2 className="font-medium mb-1">{post.title}</h2>
              <p className={`text-sm ${t.muted} line-clamp-2`}>{post.content}</p>
              <p className={`text-xs ${t.subtle} mt-2`}>By {post.author_name} &bull; {new Date(post.created_at).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FeedPost({ postId, t, dark, navigate }) {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api(`/api/feed/${postId}`).then(data => setPost(data.post)).catch(() => navigate('feed')).finally(() => setLoading(false))
  }, [postId])

  if (loading) return <div className={`text-center ${t.muted} py-12`}>Loading...</div>
  if (!post) return null

  return (
    <div>
      <button onClick={() => navigate('feed')} className={`text-sm ${t.muted} mb-4 hover:underline`}>&larr; Back to feed</button>
      <article className={`p-6 rounded-xl ${t.card} border ${t.border}`}>
        <h1 className="text-2xl font-bold mb-2">{post.title}</h1>
        <p className={`text-sm ${t.subtle} mb-6`}>By {post.author_name} &bull; {new Date(post.created_at).toLocaleDateString()}</p>
        <div className={`prose ${dark ? 'prose-invert' : ''} max-w-none`}>
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>
      </article>
    </div>
  )
}

function Profile({ user, setUser, t, dark }) {
  const [form, setForm] = useState({ name: user.name, email: user.email })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateProfile = async (e) => {
    e.preventDefault()
    setError(''); setMessage(''); setLoading(true)
    try {
      const data = await api('/api/profile', { method: 'PUT', body: JSON.stringify(form) })
      setUser(data.user)
      setMessage('Profile updated')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setError(''); setMessage(''); setLoading(true)
    try {
      await api('/api/profile/password', { method: 'PUT', body: JSON.stringify(pwForm) })
      setPwForm({ currentPassword: '', newPassword: '' })
      setMessage('Password changed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-md mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Profile</h1>
      {message && <p className="text-xs text-emerald-500 p-2 bg-emerald-500/10 rounded-lg">{message}</p>}
      {error && <p className="text-xs text-red-500 p-2 bg-red-500/10 rounded-lg">{error}</p>}

      <form onSubmit={updateProfile} className={`p-4 rounded-xl ${t.card} border ${t.border} space-y-3`}>
        <h2 className="font-medium">Edit Profile</h2>
        <input type="text" placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <button type="submit" disabled={loading} className={`w-full py-2 text-sm font-medium rounded-lg ${t.btn} ${t.btnHover} disabled:opacity-50 transition`}>{loading ? '...' : 'Save'}</button>
      </form>

      <form onSubmit={changePassword} className={`p-4 rounded-xl ${t.card} border ${t.border} space-y-3`}>
        <h2 className="font-medium">Change Password</h2>
        <input type="password" placeholder="Current password" required value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <input type="password" placeholder="New password" required minLength={8} value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <button type="submit" disabled={loading} className={`w-full py-2 text-sm font-medium rounded-lg ${t.btn} ${t.btnHover} disabled:opacity-50 transition`}>{loading ? '...' : 'Change Password'}</button>
      </form>
    </div>
  )
}

function Posts({ t, dark, navigate }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  const loadPosts = () => api('/api/posts').then(data => setPosts(data.posts)).finally(() => setLoading(false))

  useEffect(() => { loadPosts() }, [])

  const deletePost = async (id) => {
    if (!confirm('Delete this post?')) return
    await api(`/api/posts/${id}`, { method: 'DELETE' })
    loadPosts()
  }

  if (loading) return <div className={`text-center ${t.muted} py-12`}>Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Posts</h1>
        <button onClick={() => navigate('postForm')} className={`px-4 py-2 text-sm font-medium rounded-full ${t.btn} ${t.btnHover} transition`}>New Post</button>
      </div>
      {posts.length === 0 ? (
        <p className={`text-center ${t.muted} py-12`}>No posts yet. Create your first one!</p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className={`p-4 rounded-xl ${t.card} border ${t.border} flex items-center justify-between`}>
              <div className="flex-1 min-w-0 mr-4">
                <h2 className="font-medium truncate">{post.title}</h2>
                <p className={`text-xs ${t.subtle}`}>{post.published ? 'Published' : 'Draft'} &bull; {new Date(post.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate('postForm', post.id)} className={`text-xs px-3 py-1.5 rounded-full ${t.btnSecondary} transition`}>Edit</button>
                <button onClick={() => deletePost(post.id)} className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PostForm({ postId, t, navigate }) {
  const [form, setForm] = useState({ title: '', content: '', published: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!postId)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (postId) {
      api(`/api/posts/${postId}`).then(data => setForm({ title: data.post.title, content: data.post.content, published: !!data.post.published })).finally(() => setLoading(false))
    }
  }, [postId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      if (postId) {
        await api(`/api/posts/${postId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/api/posts', { method: 'POST', body: JSON.stringify(form) })
      }
      navigate('posts')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className={`text-center ${t.muted} py-12`}>Loading...</div>

  return (
    <div className="max-w-xl mx-auto">
      <button onClick={() => navigate('posts')} className={`text-sm ${t.muted} mb-4 hover:underline`}>&larr; Back to posts</button>
      <h1 className="text-2xl font-bold mb-6">{postId ? 'Edit Post' : 'New Post'}</h1>
      {error && <p className="text-xs text-red-500 mb-4 p-2 bg-red-500/10 rounded-lg">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" placeholder="Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none`} />
        <textarea placeholder="Write your post content..." required rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className={`w-full px-3 py-2 text-sm rounded-lg ${t.card} border ${t.border} focus:outline-none resize-none`} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="rounded" />
          Publish this post
        </label>
        <button type="submit" disabled={saving} className={`w-full py-2 text-sm font-medium rounded-lg ${t.btn} ${t.btnHover} disabled:opacity-50 transition`}>{saving ? '...' : postId ? 'Update Post' : 'Create Post'}</button>
      </form>
    </div>
  )
}

export default App
