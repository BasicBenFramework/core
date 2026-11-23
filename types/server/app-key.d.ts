/**
 * The key to sign with.
 *
 * @param {string} [purpose] - named in the error and warning, e.g. "upload tickets"
 * @returns {string}
 * @throws {Error} when APP_KEY is unset and NODE_ENV is production
 */
export function appKey(purpose?: string): string;
/**
 * Refuse to boot in production without a usable APP_KEY.
 *
 * Called from `createServer`. Outside production it does nothing — `appKey()`
 * covers development with a per-process key.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @throws {Error} when in production and APP_KEY is missing or shorter than 32 characters
 */
export function assertAppKey(env?: NodeJS.ProcessEnv): void;
/**
 * Forget the per-process key and warning. For tests.
 */
export function resetAppKey(): void;
/** The shortest APP_KEY accepted in production: 32 characters. */
export const MIN_APP_KEY_LENGTH: 32;
