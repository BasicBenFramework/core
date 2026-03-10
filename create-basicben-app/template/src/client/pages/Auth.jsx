import { useState } from 'react'
import { useTheme } from '../components/ThemeContext'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Alert } from '../components/Alert'
import { api } from '../api'
import { AuthLayout } from '../layouts/AuthLayout'

export function Auth({ mode, setUser, navigate }) {
  const { t } = useTheme()
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
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-3 mt-4">
        {!isLogin && <Input placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}
        <Input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input type="password" placeholder="Password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" disabled={loading} className="w-full">{loading ? '...' : isLogin ? 'Sign in' : 'Create account'}</Button>
      </form>
      <p className={`text-xs ${t.muted} text-center mt-4`}>
        {isLogin ? "Don't have an account? " : 'Have an account? '}
        <button onClick={() => navigate(isLogin ? 'register' : 'login')} className="underline hover:no-underline">{isLogin ? 'Sign up' : 'Sign in'}</button>
      </p>
    </div>
  )
}

Auth.layout = page => <AuthLayout>{page}</AuthLayout>
