interface ApiOptions extends RequestInit {
  headers?: Record<string, string>
}

interface ApiError {
  error?: string
  errors?: Record<string, string[]>
}

export const api = async <T = unknown>(path: string, options: ApiOptions = {}): Promise<T> => {
  const token = localStorage.getItem('token')
  let res: Response
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    })
  } catch {
    throw new Error('Unable to connect to server')
  }
  let data: T & ApiError
  try {
    data = await res.json()
  } catch {
    throw new Error(res.ok ? 'Invalid response from server' : `Server error (${res.status})`)
  }
  if (!res.ok) {
    const errorValues = data.errors ? Object.values(data.errors) : []
    const firstError = errorValues[0]?.[0]
    throw new Error(data.error || firstError || 'Request failed')
  }
  return data
}
