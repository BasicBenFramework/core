/**
 * Whether an address is outside the public internet.
 *
 * @param {string} address - an IPv4 or IPv6 literal
 * @returns {boolean} true for anything that is not a valid public address
 */
export function isPrivateAddress(address: string): boolean;
/**
 * Sign a payload.
 *
 * @param {string} body - the exact bytes that will be sent
 * @param {string} secret
 * @param {number|string} [timestamp] - unix seconds; when given, the signed
 *   material is `${timestamp}.${body}`, as `deliver` sends
 * @returns {string} `sha256=<hex>`
 * @throws {Error} when the secret is missing
 */
export function sign(body: string, secret: string, timestamp?: number | string): string;
/**
 * Verify a signature against a raw body.
 *
 * Pass the `X-BasicBen-Timestamp` header as `options.timestamp` — deliveries
 * sign it, and a timestamp outside `tolerance` (five minutes by default) is
 * refused, so a captured request cannot be replayed later. Without a
 * timestamp only a body-only signature verifies, which `deliver` no longer
 * sends.
 *
 * Compared with `timingSafeEqual`, so the check does not leak how much of a
 * forged signature was correct. Lengths are compared first because
 * `timingSafeEqual` throws on a mismatch rather than returning false.
 *
 * @param {string} body - the raw request body, exactly as received
 * @param {string} signature - the X-BasicBen-Signature header
 * @param {string} secret
 * @param {Object} [options]
 * @param {number|string} [options.timestamp] - the X-BasicBen-Timestamp header
 * @param {number} [options.tolerance] - seconds either side of now; default 300
 * @param {number} [options.now] - unix seconds, for tests
 * @returns {boolean}
 */
export function verify(body: string, signature: string, secret: string, options?: {
    timestamp?: number | string;
    tolerance?: number;
    now?: number;
}): boolean;
/**
 * Deliver one event to every configured URL.
 *
 * Deliveries run concurrently and independently: one slow or broken receiver
 * must not delay or cancel the others. Nothing here throws once it has
 * started — a webhook failing must never fail the request that triggered it,
 * which is a content write the user already considers done. A missing secret
 * is the exception: that is a configuration error, and sending unsigned (or
 * signed with "undefined", as this once did) is worse than refusing.
 *
 * The payload is `{ ...data, event, at }`: `event` and `at` are set last, so
 * `data` cannot make a delivery claim to be a different event than the
 * `X-BasicBen-Event` header says.
 *
 * @param {Object} options
 * @param {string[]} options.urls
 * @param {string} options.event - e.g. 'post.created'
 * @param {Object} options.data - merged into the payload
 * @param {string} options.secret
 * @param {number} [options.timeout]
 * @param {boolean} [options.allowPrivate] - permit loopback/private/link-local
 *   receivers; off by default (see "Where deliveries may go")
 * @param {Function} [options.fetch] - replaces the built-in transport (tests)
 * @returns {Promise<Array<{url: string, ok: boolean, status?: number, error?: string}>>}
 * @throws {Error} when `secret` is missing
 */
export function deliver({ urls, event, data, secret, timeout, allowPrivate, fetch: fetchImpl }?: {
    urls: string[];
    event: string;
    data: any;
    secret: string;
    timeout?: number;
    allowPrivate?: boolean;
    fetch?: Function;
}): Promise<Array<{
    url: string;
    ok: boolean;
    status?: number;
    error?: string;
}>>;
