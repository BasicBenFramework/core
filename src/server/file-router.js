/**
 * File-based Router
 *
 * Opt-in routing system that maps directory structure to routes.
 * Similar to Next.js/Remix file-based routing.
 *
 * Directory structure:
 *   src/pages/index.js        → GET /
 *   src/pages/users/index.js  → /users
 *   src/pages/users/[id].js   → /users/:id
 *   src/pages/[...slug].js    → /*
 *
 * Each file exports named handlers:
 *   export function get(req, res) {}
 *   export function post(req, res) {}
 *   export function put(req, res) {}
 *   export function del(req, res) {}    // 'delete' is reserved
 *   export function patch(req, res) {}
 *   export const middleware = [auth]    // route-specific middleware
 */

import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Router } from './router.js'

/**
 * HTTP methods to look for in route files
 */
const HTTP_METHODS = ['get', 'post', 'put', 'del', 'patch', 'delete', 'head', 'options']

/**
 * Create a file-based router from a directory
 *
 * @param {string} dir - Directory to scan (default: src/pages)
 * @param {Object} options - Configuration options
 * @param {string} options.baseUrl - Base URL prefix (default: '')
 * @param {string[]} options.extensions - File extensions to consider (default: ['.js'])
 * @returns {Promise<Router>} - Router with all routes loaded
 */
export async function createFileRouter(dir = 'src/pages', options = {}) {
  const router = new Router()
  const pagesDir = resolve(process.cwd(), dir)
  const baseUrl = options.baseUrl || ''
  const extensions = options.extensions || ['.js']

  if (!existsSync(pagesDir)) {
    return router
  }

  // Get all route files
  const files = getRouteFiles(pagesDir, extensions)

  // Sort files for consistent ordering:
  // 1. Static routes first (no dynamic segments)
  // 2. Dynamic segments ([id]) second
  // 3. Catch-all routes ([...slug]) last
  const sortedFiles = sortRouteFiles(files, pagesDir)

  // Process each file
  for (const file of sortedFiles) {
    try {
      await processRouteFile(router, file, pagesDir, baseUrl)
    } catch (err) {
      console.error(`Error loading route file: ${file}`)
      console.error(err.message)
    }
  }

  return router
}

/**
 * Process a single route file and add its handlers to the router
 */
async function processRouteFile(router, filePath, baseDir, baseUrl) {
  // Add timestamp to bust ES module cache during development
  const fileUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`
  const module = await import(fileUrl)

  // Convert file path to route path
  const routePath = filePathToRoutePath(filePath, baseDir, baseUrl)

  // Get route-specific middleware
  const middleware = Array.isArray(module.middleware) ? module.middleware : []

  // Register handlers for each HTTP method
  for (const method of HTTP_METHODS) {
    const handler = module[method]

    if (typeof handler === 'function') {
      // 'del' maps to 'delete' method
      const httpMethod = method === 'del' ? 'delete' : method

      if (middleware.length > 0) {
        router[httpMethod](routePath, ...middleware, handler)
      } else {
        router[httpMethod](routePath, handler)
      }
    }
  }

  // Support default export as GET handler (optional convenience)
  if (typeof module.default === 'function' && !module.get) {
    if (middleware.length > 0) {
      router.get(routePath, ...middleware, module.default)
    } else {
      router.get(routePath, module.default)
    }
  }
}

/**
 * Convert a file path to a route path
 *
 * Examples:
 *   /pages/index.js         → /
 *   /pages/users/index.js   → /users
 *   /pages/users/[id].js    → /users/:id
 *   /pages/posts/[id]/comments.js → /posts/:id/comments
 *   /pages/[...slug].js     → /*
 *   /pages/docs/[...path].js → /docs/*
 */
export function filePathToRoutePath(filePath, baseDir, baseUrl = '') {
  // Get relative path from base directory
  let relativePath = relative(baseDir, filePath)

  // Remove extension
  relativePath = relativePath.replace(/\.[^.]+$/, '')

  // Handle index files
  if (relativePath === 'index') {
    return baseUrl || '/'
  }

  // Remove trailing /index
  relativePath = relativePath.replace(/\/index$/, '')

  // Convert path segments
  const segments = relativePath.split(/[/\\]/)
  const routeSegments = segments.map(segment => {
    // Catch-all: [...slug] → *
    if (segment.startsWith('[...') && segment.endsWith(']')) {
      return '*'
    }

    // Dynamic segment: [id] → :id
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const paramName = segment.slice(1, -1)
      return `:${paramName}`
    }

    return segment
  })

  const path = '/' + routeSegments.join('/')

  return baseUrl ? `${baseUrl}${path}` : path
}

/**
 * Get all route files in a directory (recursive)
 */
function getRouteFiles(dir, extensions, files = []) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      // Skip special directories
      if (!entry.startsWith('_') && !entry.startsWith('.')) {
        getRouteFiles(fullPath, extensions, files)
      }
    } else {
      // Check if file has valid extension and isn't a test file
      const hasValidExt = extensions.some(ext => entry.endsWith(ext))
      const isTestFile = entry.includes('.test.') || entry.includes('.spec.')
      const isPrivate = entry.startsWith('_')

      if (hasValidExt && !isTestFile && !isPrivate) {
        files.push(fullPath)
      }
    }
  }

  return files
}

/**
 * Sort route files for proper matching order:
 * 1. Static routes (no dynamic segments)
 * 2. Dynamic segments ([id])
 * 3. Catch-all routes ([...slug])
 *
 * Within each category, more specific routes come first.
 */
function sortRouteFiles(files, baseDir) {
  return files.sort((a, b) => {
    const pathA = relative(baseDir, a)
    const pathB = relative(baseDir, b)

    const scoreA = getRouteScore(pathA)
    const scoreB = getRouteScore(pathB)

    // Lower score = higher priority
    if (scoreA !== scoreB) {
      return scoreA - scoreB
    }

    // Same score: more segments = higher priority (more specific)
    const segmentsA = pathA.split(/[/\\]/).length
    const segmentsB = pathB.split(/[/\\]/).length

    if (segmentsA !== segmentsB) {
      return segmentsB - segmentsA
    }

    // Alphabetical as tiebreaker
    return pathA.localeCompare(pathB)
  })
}

/**
 * Calculate a score for route ordering
 * Lower score = higher priority
 */
function getRouteScore(path) {
  let score = 0

  // Catch-all routes have lowest priority
  if (path.includes('[...')) {
    score += 1000
  }

  // Dynamic segments have medium priority
  const dynamicCount = (path.match(/\[[^\]\.]+\]/g) || []).length
  score += dynamicCount * 10

  return score
}

/**
 * Generate route manifest for debugging/documentation
 *
 * @param {string} dir - Directory to scan
 * @returns {Promise<Object[]>} - Array of route info objects
 */
export async function getRouteManifest(dir = 'src/pages') {
  const pagesDir = resolve(process.cwd(), dir)
  const manifest = []

  if (!existsSync(pagesDir)) {
    return manifest
  }

  const files = getRouteFiles(pagesDir, ['.js'])

  for (const file of files) {
    try {
      // Add timestamp to bust ES module cache
      const fileUrl = `${pathToFileURL(file).href}?t=${Date.now()}`
      const module = await import(fileUrl)
      const routePath = filePathToRoutePath(file, pagesDir)

      const methods = HTTP_METHODS
        .filter(m => typeof module[m] === 'function')
        .map(m => m === 'del' ? 'DELETE' : m.toUpperCase())

      // Add default export as GET if no explicit get handler
      if (typeof module.default === 'function' && !module.get) {
        methods.unshift('GET')
      }

      manifest.push({
        file: relative(pagesDir, file),
        path: routePath,
        methods,
        hasMiddleware: Array.isArray(module.middleware) && module.middleware.length > 0
      })
    } catch (err) {
      manifest.push({
        file: relative(pagesDir, file),
        path: null,
        methods: [],
        error: err.message
      })
    }
  }

  return manifest
}

export default createFileRouter
