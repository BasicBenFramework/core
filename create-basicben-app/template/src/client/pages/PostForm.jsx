import { useState, useEffect } from 'react'
import { PageHeader } from '../components/PageHeader'
import { BackLink } from '../components/BackLink'
import { Input } from '../components/Input'
import { Textarea } from '../components/Textarea'
import { Button } from '../components/Button'
import { Alert } from '../components/Alert'
import { Loading } from '../components/Loading'
import { api } from '../api'
import { AppLayout } from '../layouts/AppLayout'

export function PostForm({ postId, navigate }) {
  const [form, setForm] = useState({ title: '', content: '', published: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!postId)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (postId) {
      api(`/api/posts/${postId}`)
        .then(data => setForm({ title: data.post.title, content: data.post.content, published: !!data.post.published }))
        .finally(() => setLoading(false))
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

  if (loading) return <Loading />

  return (
    <div className="max-w-xl mx-auto">
      <BackLink onClick={() => navigate('posts')}>Back to posts</BackLink>
      <PageHeader title={postId ? 'Edit Post' : 'New Post'} />
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <Input placeholder="Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <Textarea placeholder="Write your post content..." required rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="rounded" />
          Publish this post
        </label>
        <Button type="submit" disabled={saving} className="w-full">{saving ? '...' : postId ? 'Update Post' : 'Create Post'}</Button>
      </form>
    </div>
  )
}

PostForm.layout = page => <AppLayout>{page}</AppLayout>
