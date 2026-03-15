// Database entities
export interface User {
  id: number
  name: string
  email: string
  password: string
  created_at: string
}

export interface Post {
  id: number
  user_id: number
  title: string
  content: string
  published: boolean
  created_at: string
  updated_at: string
  author_name?: string
}

// API types
export interface ApiResponse<T> {
  data?: T
  error?: string
}

// Request/Response (from BasicBen core)
export interface Request {
  body: Record<string, unknown>
  params: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
  userId?: number
}

export interface Response {
  json: (data: unknown, status?: number) => void
  status: (code: number) => Response
  send: (body?: string) => void
}

// Form data types
export interface PostFormData {
  title: string
  content: string
  published: boolean
}

export interface UserFormData {
  name: string
  email: string
  password?: string
}

export interface LoginFormData {
  email: string
  password: string
}

export interface RegisterFormData {
  name: string
  email: string
  password: string
}
