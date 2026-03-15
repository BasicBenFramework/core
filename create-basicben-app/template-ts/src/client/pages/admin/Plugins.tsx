import React, { useState, useEffect } from 'react'
import { api } from '../../../helpers/api'
import AdminLayout from '../../layouts/AdminLayout'

interface Plugin {
  name: string
  version: string
  description?: string
  author?: string
  active: boolean
}

export default function AdminPlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = async () => {
    try {
      const res = await api.get('/api/plugins')
      setPlugins(res.data?.plugins || [])
    } catch (error) {
      console.error('Failed to load plugins:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (name: string, currentlyActive: boolean) => {
    setToggling(name)

    try {
      if (currentlyActive) {
        await api.post('/api/plugins/deactivate', { name })
      } else {
        await api.post('/api/plugins/activate', { name })
      }

      setPlugins(plugins.map(p => ({
        ...p,
        active: p.name === name ? !currentlyActive : p.active
      })))

      alert(`Plugin ${currentlyActive ? 'deactivated' : 'activated'}. Restart the server to apply changes.`)
    } catch (error) {
      alert('Failed to toggle plugin')
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Plugins">
        <div className="admin-loading">Loading...</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Plugins">
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Installed Plugins</h2>
        </div>

        {plugins.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
            No plugins installed. Add plugins to the <code>plugins</code> directory.
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map(plugin => (
                <tr key={plugin.name}>
                  <td>
                    <div>
                      <strong>{plugin.name}</strong>
                      {plugin.description && (
                        <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                          {plugin.description}
                        </p>
                      )}
                      {plugin.author && (
                        <p style={{ margin: '0.25rem 0 0', color: '#9ca3af', fontSize: '0.75rem' }}>
                          by {plugin.author}
                        </p>
                      )}
                    </div>
                  </td>
                  <td>v{plugin.version}</td>
                  <td>
                    <span className={`admin-badge ${plugin.active ? 'admin-badge-success' : 'admin-badge-warning'}`}>
                      {plugin.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggle(plugin.name, plugin.active)}
                      className={`admin-btn ${plugin.active ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
                      disabled={toggling === plugin.name}
                    >
                      {toggling === plugin.name
                        ? 'Processing...'
                        : (plugin.active ? 'Deactivate' : 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-card">
        <h3 className="admin-card-title">Add New Plugin</h3>
        <p style={{ color: '#6b7280' }}>
          To add a new plugin, create a JavaScript file or directory in <code>plugins/</code>.
          Plugins can extend BasicBen with custom functionality through hooks and routes.
          See the documentation for more details on creating plugins.
        </p>
      </div>
    </AdminLayout>
  )
}
