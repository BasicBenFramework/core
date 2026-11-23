/**
 * Parse a duration.
 *
 * @param {number|string} value - ms, or '30s' / '15m' / '2h' / '1d'
 * @returns {number} milliseconds
 */
export function parseDuration(value: number | string): number;
/**
 * What a limiter reports about one key.
 *
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed
 * @property {number} limit
 * @property {number} remaining
 * @property {number} resetAt - epoch ms
 * @property {number} retryAfter - seconds; 0 while allowed
 */
/**
 * @typedef {Object} Limiter
 * @property {(key: string) => Promise<RateLimitResult>} consume - record a hit
 * @property {(key: string) => Promise<RateLimitResult>} peek - read without recording
 * @property {(key: string) => Promise<void>} reset
 * @property {Object} store
 */
/**
 * @typedef {Object} LimiterOptions
 * @property {number} limit - hits allowed per window
 * @property {number|string} [window] - the window (default '1m')
 * @property {Object} [store]
 * @property {number|string} [blockFor] - after the limit, refuse for this
 *   long regardless of the window. Turns a throttle into a lockout.
 * @property {() => number} [now] - the clock, defaulting to Date.now.
 *   Injectable so tests can advance time exactly instead of sleeping. A test
 *   that waits 80ms for a 300ms lockout passes on a quiet laptop and fails on a
 *   loaded CI runner — that is a property of the test, not of the limiter.
 */
/**
 * Create a limiter.
 *
 * @param {LimiterOptions} options
 * @returns {Limiter}
 */
export function createLimiter({ limit, window, store, blockFor, now: clock }?: LimiterOptions): Limiter;
/**
 * Rate-limiting middleware.
 *
 * Takes everything createLimiter takes, plus the options below. Pass `limiter`
 * instead of `limit`/`window` to share one limiter across several routes.
 *
 * @param {(LimiterOptions | { limiter: Limiter }) & {
 *   key?: (req: any) => string|null|undefined,
 *   trustProxy?: boolean|number,
 *   onLimited?: (req: any, res: any, info: RateLimitResult) => void,
 *   headers?: boolean,
 *   message?: string
 * }} options - `key` returning nothing lets the request through: one shared
 *   bucket for unidentifiable callers is worse than no limit at all.
 * @returns {Function & { limiter: Limiter, key: (req: any) => string|null|undefined }} middleware
 */
export function rateLimit(options?: (LimiterOptions | {
    limiter: Limiter;
}) & {
    key?: (req: any) => string | null | undefined;
    trustProxy?: boolean | number;
    onLimited?: (req: any, res: any, info: RateLimitResult) => void;
    headers?: boolean;
    message?: string;
}): Function & {
    limiter: Limiter;
    key: (req: any) => string | null | undefined;
};
/**
 * Work out who is calling.
 *
 * **X-Forwarded-For is only consulted when trustProxy is set**, and that is not
 * a default worth having: the header is client-supplied, so honouring it on a
 * directly-exposed server lets anyone rotate their apparent address and bypass
 * every limit here. Behind a proxy that overwrites the header, set it.
 *
 * Even then only the entries the proxies appended can be believed. Each proxy
 * appends the address it received the request from, so the client's address
 * is the one *your* proxies added — counted from the right. The left-most
 * entry is whatever the client sent, which is why reading it (as this once
 * did) made trustProxy a bypass rather than a fix.
 *
 * - `trustProxy: true` — one proxy in front (the common case): the right-most entry.
 * - `trustProxy: n` — n proxies in front: the n-th entry from the right. A
 *   shorter header yields its left-most entry, as Express does.
 *
 * The result is normalised so one client cannot hold many keys: an
 * IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) is reported as the IPv4 address,
 * and an IPv6 address as its /64 — a single subscriber is routinely handed a
 * whole /64, and keying on the full address gave them 2⁶⁴ budgets.
 *
 * @param {Object} req
 * @param {boolean|number} [trustProxy] - `true` = one hop; a number = that many hops
 * @returns {string}
 */
export function clientAddress(req: any, trustProxy?: boolean | number): string;
/**
 * Reduce an address to the key a client is limited under.
 *
 * @param {string} address
 * @returns {string} an IPv4 address, an IPv6 /64 as `xxxx:xxxx:xxxx:xxxx::/64`,
 *   or the input unchanged when it is not an address at all
 */
export function normalizeAddress(address: string): string;
/**
 * What a limiter reports about one key.
 */
export type RateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    /**
     * - epoch ms
     */
    resetAt: number;
    /**
     * - seconds; 0 while allowed
     */
    retryAfter: number;
};
export type Limiter = {
    /**
     * - record a hit
     */
    consume: (key: string) => Promise<RateLimitResult>;
    /**
     * - read without recording
     */
    peek: (key: string) => Promise<RateLimitResult>;
    reset: (key: string) => Promise<void>;
    store: any;
};
export type LimiterOptions = {
    /**
     * - hits allowed per window
     */
    limit: number;
    /**
     * - the window (default '1m')
     */
    window?: number | string;
    store?: any;
    /**
     * - after the limit, refuse for this
     * long regardless of the window. Turns a throttle into a lockout.
     */
    blockFor?: number | string;
    /**
     * - the clock, defaulting to Date.now.
     * Injectable so tests can advance time exactly instead of sleeping. A test
     * that waits 80ms for a 300ms lockout passes on a quiet laptop and fails on a
     * loaded CI runner — that is a property of the test, not of the limiter.
     */
    now?: () => number;
};
export { MemoryStore, DatabaseStore } from "./rate-limit-stores.js";
