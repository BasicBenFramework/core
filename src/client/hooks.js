import { useContext } from 'react'
import { RouterContext, AuthContext } from './context.js'

/**
 * Access auth state and methods
 * @returns {{ user: object|null, setUser: function, logout: function, loading: boolean }}
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within createClientApp')
  }
  return context
}

/**
 * Get navigation function
 * @returns {function} navigate(path, options)
 */
export function useNavigate() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useNavigate must be used within createClientApp')
  }
  return context.navigate
}

/**
 * Get current route params
 * @returns {object} params object (e.g. { id: '123' })
 */
export function useParams() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useParams must be used within createClientApp')
  }
  return context.params
}

/**
 * Get current path
 * @returns {string} current pathname
 */
export function usePath() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('usePath must be used within createClientApp')
  }
  return context.path
}
