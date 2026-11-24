/**
 * One copy of the framework per process.
 *
 * The framework keeps process-wide state in its modules: the hook registry,
 * the database connection, the mailer and storage adapters. Two copies loaded
 * side by side (a bad dedupe, `npm link`, a package that bundles its own, or a
 * server build that inlines the framework) each get their own. Nothing errors:
 * a listener registered with one registry is simply never fired by the other,
 * and a hook that enforces something stops enforcing it.
 *
 * So the first copy to load records where it lives, and a second copy from a
 * different place refuses to load, naming both. The fix is the app's
 * (`npm dedupe`, or keeping the framework external to the server build), not a
 * guess made here.
 *
 * The same files loaded again are allowed: a test runner that re-evaluates
 * modules while keeping `globalThis` is not two installs.
 */

import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import pkg from '../package.json' with { type: 'json' }

const KEY = Symbol.for('basicben.core')

/**
 * Record this copy, or refuse because another copy is loaded.
 *
 * @param {string} url - `import.meta.url` of a module in the copy
 * @param {string} version
 * @param {object} [scope] - where the record is kept; `globalThis` by default
 * @throws {Error} when a copy from another location is already loaded
 */
export function claimCopy(url, version, scope = globalThis) {
  // The directory, not the URL, so a query string a test runner adds does
  // not make the same files look like a second copy.
  const at = dirname(fileURLToPath(url))
  const first = scope[KEY]

  if (first && first.at !== at) {
    throw new Error(
      'Two copies of @basicbenframework/core are loaded:\n' +
        `  ${first.version} at ${first.at}\n` +
        `  ${version} at ${at}\n` +
        'Each would keep its own hooks and database connection. Install one copy ' +
        '(npm dedupe, or one version across your packages), and keep the framework ' +
        'external to your server build (ssr.external in vite.config).'
    )
  }

  scope[KEY] = { version, at }
}

claimCopy(import.meta.url, pkg.version)
