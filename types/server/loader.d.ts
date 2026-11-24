/**
 * Load all route files from a directory.
 * Each file should export a default function that receives the router.
 *
 * @param {string} dir - Directory to scan (default: src/routes)
 * @returns {Router} - Router with all routes loaded
 */
export function loadRoutes(dir?: string): Router;
/**
 * Load all middleware files from a directory.
 * Files are loaded in alphabetical order.
 * Each file should export a default middleware function.
 *
 * @param {string} dir - Directory to scan (default: src/middleware)
 * @returns {Function[]} - Array of middleware functions
 */
export function loadMiddleware(dir?: string): Function[];
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
export function loadConfig(): Promise<any>;
import { Router } from './router.js';
