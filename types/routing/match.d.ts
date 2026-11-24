/**
 * The one route matcher.
 *
 * The HTTP app, the Router and the client router all match paths here, so a
 * route means the same thing wherever it is registered. Until 0.9.0 there were
 * three, and production used the weakest: no trailing-slash handling, `.` in
 * `/feed.xml` matched any character, and params arrived still percent-encoded.
 *
 * Pattern syntax:
 * - `/posts/:id` — a param matches one non-empty segment, or part of one
 *   (`/feed/:name.xml`). Its value is URI-decoded, except `%2F` and `%5C`,
 *   which stay encoded so a param never carries a path separator.
 * - `/files/*` — a trailing `*` matches the rest of the path, including
 *   nothing; the value is `params._catchAll`, decoded the same way. Its `/`
 *   are the request's own separators; `..` segments never reach it, because
 *   URL parsing resolves them first.
 * - `*` on its own matches every path.
 * - Everything else is literal: `.`, `(`, `+` and friends mean themselves.
 *
 * Paths compare without a trailing slash, so `/about/` matches `/about`.
 * Matching is case-sensitive.
 *
 * This module has no dependencies, so the client bundle can import it.
 */
/**
 * Leading slash, no trailing slash, `/` for empty.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path: string): string;
/**
 * @typedef {Object} CompiledRoute
 * @property {string} path - the normalised pattern
 * @property {RegExp} regex
 * @property {string[]} keys - param names, in order
 * @property {(pathname: string) => Record<string, string> | null} match -
 *   params for a matching pathname, else null. Throws an error with
 *   `statusCode: 400` when a param is not valid percent-encoding.
 */
/**
 * Compile a route pattern.
 *
 * @param {string} pattern
 * @returns {CompiledRoute}
 */
export function compileRoute(pattern: string): CompiledRoute;
/**
 * A query string as an object. A key given once is a string; a key given more
 * than once is an array of every value, in order. Until 0.9.0 the server kept
 * only the last, so `?tag=a&tag=b` lost `a`.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string | string[]>}
 */
export function parseQuery(searchParams: URLSearchParams): Record<string, string | string[]>;
export type CompiledRoute = {
    /**
     * - the normalised pattern
     */
    path: string;
    regex: RegExp;
    /**
     * - param names, in order
     */
    keys: string[];
    /**
     * -
     * params for a matching pathname, else null. Throws an error with
     * `statusCode: 400` when a param is not valid percent-encoding.
     */
    match: (pathname: string) => Record<string, string> | null;
};
