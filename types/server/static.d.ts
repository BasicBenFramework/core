/**
 * Serve files from a directory.
 *
 * `untrusted: true` is for directories users write to, such as the local
 * storage driver's uploads. Every response then carries
 * `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, and
 * anything a browser would run or render as a document (HTML, SVG, XML,
 * JavaScript) is sent as `application/octet-stream` with
 * `Content-Disposition: attachment` instead of inline. The upload path already
 * stores files under an extension derived from their validated type; this is
 * the second wall, for files that got there some other way.
 *
 * @param {Object} [options]
 * @param {string} [options.dir]
 * @param {string} [options.prefix]
 * @param {number} [options.maxAge] - seconds
 * @param {string} [options.index]
 * @param {'ignore'|'allow'|'deny'} [options.dotfiles]
 * @param {boolean} [options.spa]
 * @param {RegExp[]} [options.spaExclude]
 * @param {boolean} [options.untrusted]
 * @returns {Function} middleware
 */
export function serveStatic(options?: {
    dir?: string;
    prefix?: string;
    maxAge?: number;
    index?: string;
    dotfiles?: "ignore" | "allow" | "deny";
    spa?: boolean;
    spaExclude?: RegExp[];
    untrusted?: boolean;
}): Function;
/**
 * SPA history fallback.
 *
 * Wraps a not-found handler so unmatched client routes serve index.html and the
 * browser-side router can take over. Intended for `onNoMatch`, which runs after
 * route matching — putting this in the middleware chain would shadow the API,
 * since static middleware runs before routes are matched.
 */
export function spaFallback(options: {}, next: any): (req: any, res: any) => any;
