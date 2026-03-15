import React, { useState, useEffect } from 'react'
import { api } from '../../../helpers/api'
import AdminLayout from '../../layouts/AdminLayout'

interface Theme {
  slug: string
  name: string
  version: string
  description?: string
  author?: string
  screenshot?: string
  active: boolean
}

export default function AdminThemes() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)

  useEffect(() => {
    loadThemes()
  }, [])

  const loadThemes = async () => {
    try {
      const res = await api.get('/api/themes')
      setThemes(res.data?.themes || [])
    } catch (error) {
      console.error('Failed to load themes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async (slug: string) => {
    setActivating(slug)

    try {
      await api.post('/api/themes/activate', { slug })
      setThemes(themes.map(t => ({
        ...t,
        active: t.slug === slug
      })))
    } catch (error) {
      alert('Failed to activate theme')
    } finally {
      setActivating(null)
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Themes">
        <div className="admin-loading">Loading...</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Themes">
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Installed Themes</h2>
        </div>

        {themes.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
            No themes installed. Add themes to the <code>themes</code> directory.
          </p>
        ) : (
          <div className="admin-grid admin-grid-3">
            {themes.map(theme => (
              <div
                key={theme.slug}
                style={{
                  border: theme.active ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}
              >
                {/* Screenshot */}
                <div style={{
                  height: '150px',
                  backgroundColor: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {theme.screenshot ? (
                    <img
                      src={theme.screenshot}
                      alt={theme.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '3rem' }}>🎨</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{theme.name}</h3>
                    {theme.active && (
                      <span className="admin-badge admin-badge-success">Active</span>
                    )}
                  </div>

                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    {theme.description || 'No description'}
                  </p>

                  <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '1rem' }}>
                    v{theme.version} {theme.author && `by ${theme.author}`}
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!theme.active && (
                      <button
                        onClick={() => handleActivate(theme.slug)}
                        className="admin-btn admin-btn-primary"
                        disabled={activating === theme.slug}
                      >
                        {activating === theme.slug ? 'Activating...' : 'Activate'}
                      </button>
                    )}
                    <a
                      href={`/admin/themes/${theme.slug}/customize`}
                      className="admin-btn admin-btn-secondary"
                    >
                      Customize
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card">
        <h3 className="admin-card-title">Add New Theme</h3>
        <p style={{ color: '#6b7280' }}>
          To add a new theme, create a directory in <code>themes/</code> with a <code>theme.json</code> configuration file.
          See the documentation for more details on creating themes.
        </p>
      </div>
    </AdminLayout>
  )
}
