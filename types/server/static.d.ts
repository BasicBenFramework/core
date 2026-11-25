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
 * @param {number} [options.maxAge] - seconds, for files that are neither HTML (always
 *   `no-cache`) nor under an `immutable` path
 * @param {RegExp[]} [options.immutable] - paths below the prefix whose names carry a content
 *   hash, cached for a year as immutable (default `[/^\/assets\//]`, where Vite writes)
 * @param {boolean} [options.compress] - gzip or brotli for text files of 1 KB and up (default true)
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
    immutable?: RegExp[];
    compress?: boolean;
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
 *
 * After `basicben build` with `prerender` on, it does three more things, all
 * from files the build wrote:
 *
 * - a prerendered page is served for its path: `/docs/routing` gets
 *   `docs/routing.html`, with its own content and head tags;
 * - a path no client route matches gets a real **404** (with `404.html` if
 *   the build wrote one) instead of a 200 that search engines record as a soft
 *   404 — the build saved the client route patterns to `.basicben/routes.json`;
 * - a client route that was not prerendered (one with params, a guarded one)
 *   gets the clean shell, `.basicben/shell.html`, not `index.html` — which is
 *   now the prerendered home page, and would give every such URL the home
 *   page's content and canonical link.
 *
 * Without those files it behaves as it always has.
 */
export function spaFallback(options: {}, next: any): (req: any, res: any) => any;
/**
 * Where the build writes what the server needs but must not serve: the clean
 * app shell and the client route list (see commands/prerender.js). A dot
 * directory, so serveStatic's dotfile rule keeps it private.
 */
export const BUILD_META_DIR: ".basicben";
