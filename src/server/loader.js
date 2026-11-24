/**
 * Auto-loaders for routes and middleware.
 * Scans directories and loads files automatically.
 */

import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Router } from './router.js'
import { isModuleFile } from '../modules.js'

/**
 * Load all route files from a directory.
 * Each file should export a default function that receives the router.
 *
 * @param {string} dir - Directory to scan (default: src/routes)
 * @returns {Router} - Router with all routes loaded
 */
export async function loadRoutes(dir = 'src/routes') {
  const router = new Router()
  const routesDir = resolve(process.cwd(), dir)

  if (!existsSync(routesDir)) {
    return router
  }

  const files = getJsFiles(routesDir)

  for (const file of files) {
    try {
      const fileUrl = pathToFileURL(file).href
      const module = await import(fileUrl)

      if (typeof module.default === 'function') {
        module.default(router)
      }
    } catch (err) {
      console.error(`Error loading route file: ${file}`)
      console.error(err.message)
    }
  }

  return router
}

/**
 * Load all middleware files from a directory.
 * Files are loaded in alphabetical order.
 * Each file should export a default middleware function.
 *
 * @param {string} dir - Directory to scan (default: src/middleware)
 * @returns {Function[]} - Array of middleware functions
 */
export async function loadMiddleware(dir = 'src/middleware') {
  const middleware = []
  const middlewareDir = resolve(process.cwd(), dir)

  if (!existsSync(middlewareDir)) {
    return middleware
  }

  const files = getJsFiles(middlewareDir).sort()

  for (const file of files) {
    try {
      const fileUrl = pathToFileURL(file).href
      const module = await import(fileUrl)

      if (typeof module.default === 'function') {
        middleware.push(module.default)
      }
    } catch (err) {
      console.error(`Error loading middleware file: ${file}`)
      console.error(err.message)
    }
  }

  return middleware
}

/**
 * Get all .js files in a directory (recursive)
 */
function getJsFiles(dir, files = []) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      getJsFiles(fullPath, files)
    } else if (isModuleFile(entry)) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Load basicben.config.js (or .mjs) from the project root.
 *
 * No file means defaults: `{}`. A file that exists but fails to load is an
 * error, thrown with the file's name and the reason. It used to be logged and
 * replaced by `{}`, so a typo ran the app on defaults (no CORS allowlist, the
 * console mail transport, the default migrations directory) with nothing
 * failing. A config is also where an app lists what it runs, so losing it
 * silently is the worse failure.
 *
 * A config whose default export is a promise is awaited.
 *
 * @returns {Promise<Object>} the config, or `{}` when there is no file
 * @throws {Error} when the file exists and cannot be imported
 */
export async function loadConfig() {
  const configPaths = [
    'basicben.config.js',
    'basicben.config.mjs'
  ]

  for (const configPath of configPaths) {
    const fullPath = resolve(process.cwd(), configPath)
    if (!existsSync(fullPath)) continue

    let module
    try {
      module = await import(pathToFileURL(fullPath).href)
    } catch (err) {
      throw new Error(`Could not load ${configPath}: ${err.message}`, { cause: err })
    }
    return (await module.default) || {}
  }

  return {}
}
