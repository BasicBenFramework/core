/**
 * Decide whether a URL is safe to emit.
 *
 * Two things make this harder than a prefix check.
 *
 * Browsers ignore characters that a naive parser does not. A leading newline,
 * tab, or NUL inside the scheme is stripped before the URL is resolved, so
 * `java\0script:` and `java\tscript:` both navigate. They are removed here
 * before anything is compared.
 *
 * HTML entities are decoded by the parser *after* this runs, so a scheme can be
 * hidden as `&#x6A;avascript:` and reassemble itself downstream. Callers decode
 * entities before calling this; the check below is the second line, catching a
 * scheme that only becomes one after decoding.
 *
 * @param {string} url
 * @param {string[]} [schemes]
 * @returns {boolean}
 */
export function isSafeUrl(url: string, schemes?: string[]): boolean;
/**
 * Escape text for HTML.
 *
 * Quotes are escaped too, which matters for attribute values, and a bare `'`
 * is escaped because unquoted attributes exist in the wild.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text: string): string;
/**
 * Decode HTML entities.
 *
 * Needed *before* a URL is scheme-checked, because `&#x6A;avascript:alert(1)`
 * is inert text to a comparison and a working URL to a browser.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text: string): string;
/**
 * Strip HTML to a plain-text approximation.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripTags(html: string): string;
/**
 * Sanitize an HTML fragment against an allowlist.
 *
 * @param {string} html
 * @param {Object} [options]
 * @param {Object} [options.allowed] - tag → permitted attributes
 * @param {string[]} [options.schemes] - permitted URL schemes
 * @param {boolean} [options.allowDataImages] - permit `data:image/...` in `src`
 * @param {string} [options.idPrefix] - prepended to `id`/`name` values not
 *   already carrying it; defaults to `user-content-`, `''` disables. In-page
 *   links (`href="#x"`) to an id in the same fragment are rewritten to match.
 * @returns {string}
 */
export function sanitizeHtml(html: string, options?: {
    allowed?: any;
    schemes?: string[];
    allowDataImages?: boolean;
    idPrefix?: string;
}): string;
/**
 * Point in-page links at the prefixed ids.
 *
 * Once `id="intro"` has become `id="user-content-intro"`, a `href="#intro"` in
 * the same content would go nowhere. Only fragments naming an id that is
 * actually in this output are rewritten — a link to `#comments` elsewhere on
 * the page is left alone. Runs over markup this module (or the Markdown
 * renderer) just produced, whose attributes are always double-quoted and
 * escaped, which is what makes a pattern match reliable here.
 *
 * @param {string} html
 * @param {Set<string>} ids - prefixed ids present, as they appear in the markup
 * @param {string} prefix
 * @returns {string}
 */
export function prefixFragmentLinks(html: string, ids: Set<string>, prefix: string): string;
export namespace DEFAULT_ALLOWED {
    let p: any[];
    let br: any[];
    let hr: any[];
    let h1: string[];
    let h2: string[];
    let h3: string[];
    let h4: string[];
    let h5: string[];
    let h6: string[];
    let em: any[];
    let strong: any[];
    let del: any[];
    let s: any[];
    let sub: any[];
    let sup: any[];
    let blockquote: any[];
    let ul: any[];
    let ol: string[];
    let li: any[];
    let dl: any[];
    let dt: any[];
    let dd: any[];
    let pre: any[];
    let code: string[];
    let a: string[];
    let img: string[];
    let figure: any[];
    let figcaption: any[];
    let table: any[];
    let thead: any[];
    let tbody: any[];
    let tfoot: any[];
    let tr: any[];
    let th: string[];
    let td: string[];
    let span: string[];
    let div: string[];
    let input: string[];
}
/**
 * Prefix given to every `id` and `name` in sanitized output.
 *
 * Content that can name elements can clobber the page around it: an
 * `<a id="config">` becomes `window.config`, and `<img name="getElementById">`
 * shadows a `document` method — DOM clobbering, which turns "harmless" markup
 * into a way to steer the page's own scripts. Namespacing every id keeps the
 * content's names out of the page's. GitHub uses the same prefix for the same
 * reason.
 */
export const DEFAULT_ID_PREFIX: "user-content-";
/** Schemes permitted in a URL attribute. */
export const DEFAULT_ALLOWED_SCHEMES: string[];
