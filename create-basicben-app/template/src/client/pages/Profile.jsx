import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Alert } from '../components/Alert'
import { api } from '../api'

export function Profile({ user, setUser }) {
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
    <div className="max-w-md mx-auto space-y-6">
      <PageHeader title="Profile" />
      {message && <Alert type="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card>
        <form onSubmit={updateProfile} className="space-y-3">
          <h2 className="font-medium mb-2">Edit Profile</h2>
          <Input placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Button type="submit" disabled={loading} className="w-full">{loading ? '...' : 'Save'}</Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={changePassword} className="space-y-3">
          <h2 className="font-medium mb-2">Change Password</h2>
          <Input type="password" placeholder="Current password" required value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
          <Input type="password" placeholder="New password" required minLength={8} value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} />
          <Button type="submit" disabled={loading} className="w-full">{loading ? '...' : 'Change Password'}</Button>
        </form>
      </Card>
    </div>
  )
}
