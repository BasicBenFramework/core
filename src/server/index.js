/**
 * BasicBen Server
 *
 * Built on Polka with custom router, middleware, and auto-loading.
 */

import polka from 'polka'
import { Router, createRouter } from './router.js'
import { bodyParser, json } from './body-parser.js'
import { cors } from './cors.js'
import { serveStatic } from './static.js'
import { loadRoutes, loadMiddleware, loadConfig } from './loader.js'

/**
 * Create a BasicBen server instance
 */
export async function createServer(options = {}) {
  const config = await loadConfig()
  const mergedConfig = { ...defaultConfig, ...config, ...options }

  const app = polka({
    onError: mergedConfig.onError || defaultErrorHandler,
    onNoMatch: mergedConfig.onNoMatch || defaultNotFoundHandler
  })

  // Core middleware
  app.use(addResponseHelpers)

  if (mergedConfig.cors) {
    app.use(cors(mergedConfig.cors === true ? {} : mergedConfig.cors))
  }

  if (mergedConfig.bodyParser !== false) {
    app.use(bodyParser(mergedConfig.bodyParser || {}))
  }

  if (mergedConfig.static) {
    app.use(serveStatic(mergedConfig.static === true ? {} : mergedConfig.static))
  }

  // Load user middleware
  if (mergedConfig.autoloadMiddleware !== false) {
    const userMiddleware = await loadMiddleware(mergedConfig.middlewareDir)
    for (const mw of userMiddleware) {
      app.use(mw)
    }
  }

  // Load routes
  if (mergedConfig.autoloadRoutes !== false) {
    const router = await loadRoutes(mergedConfig.routesDir)
    router.applyTo(app)
  }

  // Add helper methods
  app.router = createRouter()

  /**
   * Start the server
   */
  app.start = (port, callback) => {
    const listenPort = port || mergedConfig.port || 3001

    return new Promise((resolve, reject) => {
      app.listen(listenPort, (err) => {
        if (err) {
          reject(err)
          return
        }

        if (callback) callback()
        resolve(app)
      })
    })
  }

  return app
}

/**
 * Default configuration
 */
const defaultConfig = {
  port: 3001,
  cors: true,
  bodyParser: { limit: '1mb' },
  static: { dir: 'public' },
  routesDir: 'src/routes',
  middlewareDir: 'src/middleware',
  autoloadRoutes: true,
  autoloadMiddleware: true
}

/**
 * Default error handler
 */
function defaultErrorHandler(err, req, res) {
  console.error('Server error:', err)

  const statusCode = err.statusCode || err.status || 500
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message

  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: message }))
}

/**
 * Default 404 handler
 */
function defaultNotFoundHandler(req, res) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Not Found' }))
}

/**
 * Response helpers - added to res object
 */
export function addResponseHelpers(req, res, next) {
  /**
   * Send JSON response
   */
  res.json = (data, statusCode = 200) => {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }

  /**
   * Send response with status code
   */
  res.status = (code) => {
    res.statusCode = code
    return res
  }

  /**
   * Send text response
   */
  res.send = (data) => {
    if (typeof data === 'object') {
      return res.json(data)
    }
    res.end(String(data))
  }

  /**
   * Redirect to URL
   */
  res.redirect = (url, statusCode = 302) => {
    res.statusCode = statusCode
    res.setHeader('Location', url)
    res.end()
  }

  next()
}

// Re-export components
export { Router, createRouter } from './router.js'
export { bodyParser, json } from './body-parser.js'
export { cors } from './cors.js'
export { serveStatic } from './static.js'
export { loadRoutes, loadMiddleware, loadConfig } from './loader.js'
