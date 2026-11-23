/**
 * APP_KEY resolution.
 *
 * Several parts of the framework sign things with APP_KEY — local storage
 * URLs, upload tickets. Each used to fall back to a string literal when the key
 * was missing, and a literal that ships in the package is a key everyone has:
 * anyone could mint a signed upload URL or a ticket for any deployment that
 * forgot to set APP_KEY. There is no safe constant to fall back to, so there is
 * no constant at all.
 *
 * - In production a missing key is an error, raised where the key is needed and
 *   again at boot (`assertAppKey`) so the failure is the first thing seen, not
 *   a 500 on the first upload.
 * - Elsewhere a random key is generated once per process, with a single
 *   warning. Signatures then do not survive a restart, which in development is
 *   a fair price for never having a guessable key.
 */

import { randomBytes } from 'node:crypto'

/** The shortest APP_KEY accepted in production: 32 characters. */
export const MIN_APP_KEY_LENGTH = 32

let processKey = null
let warned = false

/**
 * The key to sign with.
 *
 * @param {string} [purpose] - named in the error and warning, e.g. "upload tickets"
 * @returns {string}
 * @throws {Error} when APP_KEY is unset and NODE_ENV is production
 */
export function appKey(purpose = 'signing') {
  const key = process.env.APP_KEY
  if (key) return key

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `APP_KEY is not set, and ${purpose} cannot be signed without it. ` +
      'Set APP_KEY to a random string of at least 32 characters ' +
      '(e.g. `node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"`).'
    )
  }

  if (!processKey) processKey = randomBytes(32).toString('hex')

  if (!warned) {
    warned = true
    console.warn(
      '[basicben] APP_KEY is not set; using a random key for this process. ' +
      'Signed URLs and upload tickets will not survive a restart. Set APP_KEY in .env.'
    )
  }

  return processKey
}

/**
 * Refuse to boot in production without a usable APP_KEY.
 *
 * Called from `createServer`. Outside production it does nothing — `appKey()`
 * covers development with a per-process key.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @throws {Error} when in production and APP_KEY is missing or shorter than 32 characters
 */
export function assertAppKey(env = process.env) {
  if (env.NODE_ENV !== 'production') return

  const key = env.APP_KEY

  if (!key) {
    throw new Error(
      'APP_KEY is not set. BasicBen refuses to start in production without it, because it ' +
      'signs upload URLs and tickets. Set APP_KEY to a random string of at least ' +
      `${MIN_APP_KEY_LENGTH} characters.`
    )
  }

  if (key.length < MIN_APP_KEY_LENGTH) {
    throw new Error(
      `APP_KEY is ${key.length} characters long; production requires at least ${MIN_APP_KEY_LENGTH}. ` +
      'A short key can be brute-forced offline from any signature it produced.'
    )
  }
}

/**
 * Forget the per-process key and warning. For tests.
 */
export function resetAppKey() {
  processKey = null
  warned = false
}
