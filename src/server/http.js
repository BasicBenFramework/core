/**
 * Minimal HTTP Server
 *
 * Zero-dependency HTTP server using Node's built-in http module.
 * Express/Polka-compatible middleware API.
 */

import { createServer as createHttpServer } from 'node:http'
import { compileRoute, parseQuery } from '../routing/match.js'

/**
 * Create a minimal HTTP server instance
 */
export function createApp(options = {}) {
  const middleware = []
  const routes = new Map()  // method -> [{path, matcher, handlers}]
  const onError = options.onError || defaultErrorHandler
  const onNoMatch = options.onNoMatch || defaultNotFoundHandler

  // Initialize route maps for each method
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  for (const method of methods) {
    routes.set(method, [])
  }

  /**
   * Add global middleware
   */
  function use(...handlers) {
    for (const handler of handlers) {
      if (typeof handler === 'function') {
        middleware.push(handler)
      }
    }
    return app
  }

  /**
   * Register a route
   */
  function addRoute(method, path, ...handlers) {
    routes.get(method.toUpperCase()).push({
      path,
      matcher: compileRoute(path),
      handlers
    })
    return app
  }

  /**
   * Match a request to a route: the first registered for the method, in
   * order. A HEAD request with no HEAD route of its own runs the GET route;
   * Node sends no body for HEAD, so only the headers go out.
   */
  function matchRoute(method, pathname) {
    const upper = method.toUpperCase()
    const found = findRoute(upper, pathname)
    if (found || upper !== 'HEAD') return found
    return findRoute('GET', pathname)
  }

  function findRoute(method, pathname) {
    for (const route of routes.get(method) || []) {
      const params = route.matcher.match(pathname)
      if (params) return { route, params }
    }
    return null
  }

  /**
   * Hand an error to onError, and survive onError failing.
   *
   * An error handler that throws — or one that writes headers on a response
   * that has already been sent — used to surface as an unhandled rejection,
   * which takes the whole process down under Node's default policy. One bad
   * request should never cost every other in-flight request its connection.
   */
  async function handleError(err, req, res) {
    try {
      await onError(err, req, res)
    } catch (handlerError) {
      console.error('Error handler failed:', handlerError)
      try {
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal Server Error' }))
        } else if (!res.writableEnded) {
          res.destroy()
        }
      } catch {
        // Nothing more can be done for this response.
      }
    }
  }

  /**
   * Run middleware chain
   */
  async function runMiddleware(handlers, req, res) {
    let index = 0

    const next = async (err) => {
      if (err) {
        return handleError(err, req, res)
      }

      if (index >= handlers.length) {
        return
      }

      const handler = handlers[index++]

      try {
        await handler(req, res, next)
      } catch (error) {
        await handleError(error, req, res)
      }
    }

    await next()
  }

  /**
   * Handle incoming request
   */
  async function handleRequest(req, res) {
    // Parse URL using WHATWG URL API
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    req.path = url.pathname || '/'
    req.query = parseQuery(url.searchParams)
    req.params = {}

    if (req.method === 'HEAD') keepContentLength(res)

    // Find matching route. A param that is not valid percent-encoding is the
    // client's error: a plain 400 after the global middleware (so it carries
    // the security headers), not an exception for the error handler to log
    // as a server error.
    let matched
    try {
      matched = matchRoute(req.method, req.path)
    } catch (err) {
      if (err?.statusCode !== 400) throw err
      return runMiddleware([...middleware, () => sendBadRequest(res)], req, res)
    }

    if (matched) {
      req.params = matched.params

      // Combine global middleware + route handlers
      const handlers = [...middleware, ...matched.route.handlers]
      await runMiddleware(handlers, req, res)
    } else {
      // Run global middleware first, then 404
      await runMiddleware([...middleware, () => onNoMatch(req, res)], req, res)
    }
  }

  /**
   * Create the HTTP server
   */
  const server = createHttpServer((req, res) => {
    handleRequest(req, res).catch(err => handleError(err, req, res))
  })

  /**
   * The app object
   */
  const app = {
    use,
    server,


    // HTTP method shortcuts
    get: (path, ...handlers) => addRoute('GET', path, ...handlers),
    post: (path, ...handlers) => addRoute('POST', path, ...handlers),
    put: (path, ...handlers) => addRoute('PUT', path, ...handlers),
    patch: (path, ...handlers) => addRoute('PATCH', path, ...handlers),
    delete: (path, ...handlers) => addRoute('DELETE', path, ...handlers),
    head: (path, ...handlers) => addRoute('HEAD', path, ...handlers),
    options: (path, ...handlers) => addRoute('OPTIONS', path, ...handlers),

    /**
     * Start listening
     */
    listen(port, callback) {
      server.listen(port, callback)
      return app
    },

    /**
     * Close the server
     */
    close(callback) {
      server.close(callback)
    }
  }

  return app
}

/**
 * A plain 400 for a request whose URL cannot be decoded.
 */
function sendBadRequest(res) {
  if (res.headersSent) return
  res.statusCode = 400
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Bad Request' }))
}

/**
 * Give a HEAD response the Content-Length its GET would have had.
 *
 * Node drops the body of a HEAD response, and with it the length it would
 * have computed from `res.end(body)`, so a HEAD that ran the GET route went
 * out with no Content-Length at all. A response written in pieces with
 * `res.write()` is chunked on GET too, and is left alone.
 */
function keepContentLength(res) {
  const end = res.end
  const write = res.write
  let streamed = false

  res.write = function (...args) {
    streamed = true
    return write.apply(this, args)
  }

  res.end = function (chunk, encoding, callback) {
    if (!streamed && !res.headersSent && chunk !== undefined && chunk !== null &&
        typeof chunk !== 'function' && res.getHeader('Content-Length') === undefined) {
      const enc = typeof encoding === 'string' ? encoding : 'utf8'
      res.setHeader('Content-Length', Buffer.isBuffer(chunk) || chunk instanceof Uint8Array ? chunk.byteLength : Buffer.byteLength(String(chunk), enc))
    }
    return end.call(this, chunk, encoding, callback)
  }
}

/**
 * Default error handler
 */
function defaultErrorHandler(err, req, res) {
  console.error('Server error:', err)

  if (res.headersSent) {
    // A partial response cannot be turned into an error response; cut it off
    // so the client sees a failure rather than a silently truncated body.
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
  if (res.headersSent) return

  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Not Found' }))
}
