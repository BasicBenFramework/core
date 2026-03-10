import { useState, useEffect } from 'react'

function App() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage('Failed to connect to API'))
  }, [])

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>BasicBen</h1>
      <p style={styles.message}>{message}</p>
      <p style={styles.hint}>
        Edit <code style={styles.code}>src/client/App.jsx</code> to get started
      </p>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f5f5f5',
    margin: 0
  },
  title: {
    fontSize: '3rem',
    fontWeight: 700,
    color: '#333',
    margin: 0
  },
  message: {
    fontSize: '1.25rem',
    color: '#666',
    marginTop: '1rem'
  },
  hint: {
    fontSize: '0.875rem',
    color: '#999',
    marginTop: '2rem'
  },
  code: {
    backgroundColor: '#e5e5e5',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontFamily: 'monospace'
  }
}

export default App
