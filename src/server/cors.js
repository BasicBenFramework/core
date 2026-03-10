/**
 * CORS middleware.
 * Handles Cross-Origin Resource Sharing headers.
 */

const defaults = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: [],
  credentials: false,
  maxAge: 86400 // 24 hours
}

export function cors(options = {}) {
  const config = { ...defaults, ...options }

  return (req, res, next) => {
    const origin = req.headers.origin

    // Set origin header
    if (config.origin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*')
    } else if (typeof config.origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', config.origin)
      res.setHeader('Vary', 'Origin')
    } else if (Array.isArray(config.origin)) {
      if (origin && config.origin.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
      }
    } else if (typeof config.origin === 'function') {
      const allowed = config.origin(origin, req)
      if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', typeof allowed === 'string' ? allowed : origin)
        res.setHeader('Vary', 'Origin')
      }
    }

    // Credentials
    if (config.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    // Exposed headers
    if (config.exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '))
      res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
      res.setHeader('Access-Control-Max-Age', String(config.maxAge))

      res.statusCode = 204
      res.end()
      return
    }

    next()
  }
}
