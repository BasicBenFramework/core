/**
 * @typedef {Object} ClientLocation
 * @property {string} pathname - e.g. `/posts/1`
 * @property {string} search - `?q=x`, or ''
 * @property {string} hash - `#top`, or ''
 */
/**
 * Resolve a navigation target against the current location.
 *
 * `navigate('/x?y=1')` used to store the whole string as the path, so the
 * route table was asked about `/x?y=1` and answered NotFound.
 *
 * @param {string} to - absolute path, relative path, or full URL
 * @param {string} base - the current href
 * @returns {ClientLocation & { origin: string, href: string }}
 */
export function resolveLocation(to: string, base: string): ClientLocation & {
    origin: string;
    href: string;
};
/** `pathname + search + hash`, what history.pushState is given. */
export function locationPath(location: any): string;
/**
 * Build the matcher for a route table: first match, in the table's order.
 *
 * @param {Array<{ path: string }>} routes
 * @returns {(pathname: string) => { route: any, params: Record<string, string> } | null}
 */
export function createMatcher(routes: Array<{
    path: string;
}>): (pathname: string) => {
    route: any;
    params: Record<string, string>;
} | null;
/**
 * Where a route's guard sends this visitor, or null to render it.
 *
 * @param {{ auth?: boolean, guest?: boolean }} route
 * @param {any} user
 * @param {{ loginPath: string, homePath: string }} paths
 * @returns {string | null}
 */
export function guardRedirect(route: {
    auth?: boolean;
    guest?: boolean;
}, user: any, { loginPath, homePath }: {
    loginPath: string;
    homePath: string;
}): string | null;
/**
 * Whether a click on a Link should be handled by the router rather than the
 * browser. Modified clicks (new tab, new window, download), other buttons,
 * targets other than this frame and other origins are left to the browser.
 *
 * @param {{ button?: number, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, defaultPrevented?: boolean }} event
 * @param {{ target?: string, download?: any, origin: string, currentOrigin: string }} link
 * @returns {boolean}
 */
export function shouldHandleClick(event: {
    button?: number;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    defaultPrevented?: boolean;
}, link: {
    target?: string;
    download?: any;
    origin: string;
    currentOrigin: string;
}): boolean;
/**
 * The next query string for setSearchParams.
 *
 * @param {URLSearchParams | Record<string, string | string[] | number | boolean | null | undefined> | string | ((prev: URLSearchParams) => any)} next
 * @param {URLSearchParams} prev
 * @returns {string} `?a=1`, or '' when empty
 */
export function nextSearch(next: URLSearchParams | Record<string, string | string[] | number | boolean | null | undefined> | string | ((prev: URLSearchParams) => any), prev: URLSearchParams): string;
export type ClientLocation = {
    /**
     * - e.g. `/posts/1`
     */
    pathname: string;
    /**
     * - `?q=x`, or ''
     */
    search: string;
    /**
     * - `#top`, or ''
     */
    hash: string;
};
