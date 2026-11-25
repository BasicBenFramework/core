/**
 * BasicBen Server
 *
 * Zero-dependency HTTP server with custom router, middleware, and auto-loading.
 * Includes a hook system for extensibility.
 */

import { createApp } from './http.js'
import { Router, createRouter } from './router.js'
import { bodyParser, json } from './body-parser.js'
import { cors } from './cors.js'
import { serveStatic, spaFallback } from './static.js'
import { loadRoutes, loadMiddleware, loadConfig } from './loader.js'
import { hooks, HOOKS } from '../hooks/index.js'
import { securityHeaders } from './security-headers.js'
import { assertAppKey } from './app-key.js'

/**
 * Create a BasicBen server instance
 */
export async function createServer(options = {}) {
  const config = await loadConfig()
  const mergedConfig = { ...defaultConfig, ...config, ...options }

  // Fail at boot, not on the first signed upload: production without a real
  // APP_KEY would otherwise run until something needs to sign.
  assertAppKey()

  // Fire server.starting hook
  await hooks.fire(HOOKS.SERVER_STARTING, { config: mergedConfig })

  const staticConfig = mergedConfig.static === true ? {} : (mergedConfig.static || {})
  const notFoundHandler = mergedConfig.onNoMatch || defaultNotFoundHandler

  // The SPA fallback has to sit in onNoMatch rather than the middleware chain:
  // static middleware runs before routes are matched, so a fallback there would
  // answer API requests with the app shell.
  const onNoMatch = mergedConfig.static && staticConfig.spa
    ? spaFallback(staticConfig, notFoundHandler)
    : notFoundHandler

  const app = createApp({
    onError: mergedConfig.onError || defaultErrorHandler,
    onNoMatch
  })

  // Core middleware
  app.use(addResponseHelpers)

  // `/about` and `/about/` both match the same route, which a search engine
  // sees as two pages with the same content. `trailingSlash: 'redirect'`
  // answers the slashed form of a GET or HEAD with a 301 to the bare one.
  if (mergedConfig.trailingSlash === 'redirect') {
    app.use(redirectTrailingSlash)
  }

  // First, so every response — 404s and errors included — carries them, and
  // before any handler, so one that sets its own header replaces the default.
  if (mergedConfig.securityHeaders !== false) {
    app.use(securityHeaders(mergedConfig.securityHeaders === true ? {} : (mergedConfig.securityHeaders || {})))
  }

  // Request hooks middleware
  app.use(requestHooksMiddleware)

  if (mergedConfig.cors) {
    app.use(cors(mergedConfig.cors === true ? {} : mergedConfig.cors))
  }

  // Presigned uploads on the local driver land here, and this has to run
  // *before* the body parser: the parser drains every non-GET request into a
  // utf8 string, which both consumes the stream and corrupts binary. That is
  // the reason the previous multipart upload path could never have worked.
  const storageConfig = mergedConfig.storage || {}
  if (storageConfig.driver !== false && !storageConfig.bucket && !process.env.S3_BUCKET) {
    const { localUploadReceiver } = await import('../storage/local-upload.js')
    app.use(localUploadReceiver({
      dir: storageConfig.dir,
      baseUrl: storageConfig.baseUrl,
      secret: storageConfig.secret,
      maxSize: storageConfig.maxSize
    }))

    // And the files it accepts have to be readable again.
    //
    // In development the app's static root is `public`, so `/uploads/...`
    // resolved by accident. A production build serves `dist/client`, which is
    // written at build time — so every file uploaded after the build 404'd,
    // in the admin media library and on the content API alike. Mounted ahead
    // of the app's own static middleware so the upload directory answers for
    // its own prefix rather than depending on where the app happens to serve
    // from.
    //
    // Marked untrusted: users write to this directory, so nothing in it may
    // render as a document or run as script on the app's origin.
    app.use(serveStatic({
      dir: storageConfig.dir || 'public/uploads',
      prefix: storageConfig.baseUrl || '/uploads',
      untrusted: true
    }))
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

  // Create main router
  const router = createRouter()
  app.router = router

  // Load routes
  if (mergedConfig.autoloadRoutes !== false) {
    const loadedRouter = await loadRoutes(mergedConfig.routesDir)
    loadedRouter.applyTo(app)
  }

  router.applyTo(app)

  // `server.started` used to fire only from app.start(), and nothing calls
  // app.start() — both the TypeScript template's entry and the generated
  // production entry call app.listen() directly. So the hook never fired in any
  // real app, including for anything listening for it.
  //
  // Wrapping listen() means it fires however the server is started, including
  // from a hand-written entry. The flag stops it firing twice when app.start()
  // is used, since that calls listen() underneath.
  const nativeListen = app.listen.bind(app)
  let announced = false

  const announceStarted = async (port) => {
    if (announced) return
    announced = true

    await hooks.fire(HOOKS.SERVER_STARTED, { port, config: mergedConfig })
  }

  app.listen = (port, callback) => {
    return nativeListen(port, async (err) => {
      if (!err) await announceStarted(port)
      if (callback) callback(err)
    })
  }

  /**
   * Start the server
   */
  app.start = async (port, callback) => {
    const listenPort = port || mergedConfig.port || 3001

    return new Promise((resolve, reject) => {
      app.listen(listenPort, async (err) => {
        if (err) {
          reject(err)
          return
        }

        if (callback) callback()
        resolve(app)
      })
    })
  }

  /**
   * Stop the server gracefully
   */
  app.stop = async () => {
    await hooks.fire(HOOKS.SERVER_STOPPING, {})

    if (app.server) {
      return new Promise((resolve) => {
        app.server.close(() => resolve())
      })
    }
  }

  // Expose hooks on app, so a handler can fire or listen without an import.
  app.hooks = hooks

  return app
}

/**
 * Responses whose end() has been called but not yet flushed.
 *
 * The request.after hook runs between a handler calling res.end() and the
 * bytes going out, so for that window neither headersSent nor writableEnded is
 * true — and an error thrown in it looked like a response nobody had answered.
 * The error handler then wrote a second response into the same socket.
 */
const endingResponses = new WeakSet()

/**
 * 301 from `/path/` to `/path`, keeping the query string. GET and HEAD only:
 * a redirected POST would lose its body in some clients. `/` is left alone,
 * and so is `//`, which is not a path to redirect but an open-redirect probe.
 */
export function redirectTrailingSlash(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const path = req.path || '/'
  if (path.length <= 1 || !path.endsWith('/') || path.startsWith('//')) return next()

  const bare = path.replace(/\/+$/, '') || '/'
  const query = (req.url || '').includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  res.statusCode = 301
  res.setHeader('Location', bare + query)
  res.setHeader('Content-Length', 0)
  res.end()
}

/**
 * Request hooks middleware - fires request.before and request.after hooks
 */
async function requestHooksMiddleware(req, res, next) {
  // Store original end method
  const originalEnd = res.end.bind(res)
  let responseData = null

  // Fire request.before hook
  try {
    const context = await hooks.filter(HOOKS.REQUEST_BEFORE, { req, res })
    // Allow hooks to modify req/res or short-circuit
    if (context.handled) {
      return
    }
  } catch (err) {
    console.error('Error in request.before hook:', err.message)
  }

  // Override res.end to capture response and fire request.after
  res.end = async function(data, encoding) {
    // The first end() wins. A second one — typically an error handler running
    // after a handler already answered — would be a write after end.
    if (endingResponses.has(res)) return res
    endingResponses.add(res)

    responseData = data

    // Fire request.after hook
    try {
      await hooks.fire(HOOKS.REQUEST_AFTER, {
        req,
        res,
        responseData,
        statusCode: res.statusCode
      })
    } catch (err) {
      console.error('Error in request.after hook:', err.message)
    }

    // Call original end
    originalEnd(data, encoding)
  }

  next()
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

  // Fire request.error hook
  hooks.fire(HOOKS.REQUEST_ERROR, { err, req, res }).catch(console.error)

  // An error after the response has started — a handler that threw after
  // res.json(), a stream that failed mid-body — used to call setHeader on a
  // sent response, which throws ERR_HTTP_HEADERS_SENT from inside the error
  // handler and crashed the process.
  if (endingResponses.has(res)) return

  if (res.headersSent || res.writableEnded) {
    if (!res.writableEnded) res.destroy()
    return
  }

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
  // An explicit second argument wins; otherwise whatever res.status() already
  // set is kept. Defaulting to 200 here made `res.status(404).json(...)` — the
  // idiom everyone reaches for — silently answer 200.
  res.json = (data, statusCode) => {
    if (statusCode !== undefined) {
      res.statusCode = statusCode
    }
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
   *
   * Without a Content-Type a browser sniffs the body, and a string that looks
   * like markup gets rendered as HTML — so a handler echoing anything
   * user-supplied through res.send() was an XSS. Plain text is the default;
   * set a Content-Type first to send HTML on purpose.
   */
  res.send = (data) => {
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
      return res.json(data)
    }
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', Buffer.isBuffer(data) ? 'application/octet-stream' : 'text/plain; charset=utf-8')
    }
    res.end(Buffer.isBuffer(data) ? data : String(data))
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
export { createApp } from './http.js'
export { Router, createRouter } from './router.js'
export { bodyParser, json } from './body-parser.js'
export { cors } from './cors.js'
export { serveStatic } from './static.js'
export { securityHeaders, DEFAULT_SECURITY_HEADERS } from './security-headers.js'
export { appKey, assertAppKey } from './app-key.js'
export { loadRoutes, loadMiddleware, loadConfig } from './loader.js'
export { hooks, HOOKS } from '../hooks/index.js'
export {
  getEnvironment,
  isCloud,
  isSelfHosted,
  getVersion
} from './environment.js'
