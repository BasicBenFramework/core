/**
 * The resolved head for one page: every fallback decided.
 *
 * @param {HeadConfig | undefined} config
 * @param {HeadMeta | null | undefined} page - the route's head merged with useHead's
 * @param {string} pathname
 * @returns {{ title: string, ogTitle: string, description: string | null, canonical: string | null,
 *   image: string | null, noindex: boolean, type: string, siteName: string | null,
 *   locale: string | null, twitterSite: string | null, jsonLd: unknown }}
 */
export function resolveHead(config?: HeadConfig | undefined, page?: HeadMeta | null | undefined, pathname?: string): {
    title: string;
    ogTitle: string;
    description: string | null;
    canonical: string | null;
    image: string | null;
    noindex: boolean;
    type: string;
    siteName: string | null;
    locale: string | null;
    twitterSite: string | null;
    jsonLd: unknown;
};
/** A route's head for these params: its object, or what its function returns. */
export function routeHead(route: any, params?: {}): any;
/**
 * The head as HTML, for the prerender: `<title>` first, then the tags.
 *
 * @param {ReturnType<typeof resolveHead>} head
 * @returns {string}
 */
export function headTags(head: ReturnType<typeof resolveHead>): string;
/**
 * Write a resolved head into the live document: set the title, update the
 * tags it manages, add the missing ones and remove the ones this page does not
 * have. Tags the app wrote itself (a viewport, a stylesheet) are not touched.
 *
 * @param {ReturnType<typeof resolveHead>} head
 * @param {Document} [doc]
 */
export function applyHead(head: ReturnType<typeof resolveHead>, doc?: Document): void;
export namespace NOT_FOUND_HEAD {
    let title: string;
    let noindex: boolean;
}
/**
 * - createClientApp's `head`: the site-wide defaults
 */
export type HeadConfig = {
    /**
     * - the site's name: the title of a page that sets none, and og:site_name
     */
    title?: string;
    /**
     * - how a page's title becomes
     * the <title>: `'%s — My Site'`, or a function. Default: the page title alone
     */
    titleTemplate?: string | ((title: string) => string);
    /**
     * - for pages that set none
     */
    description?: string;
    /**
     * - absolute origin, e.g. `https://example.com`; canonical and
     * og:url are built from it. Without it, neither is emitted
     */
    siteUrl?: string;
    /**
     * - absolute URL of the default share image
     */
    image?: string;
    /**
     * - og:locale, e.g. `en_GB`
     */
    locale?: string;
    /**
     * - the site's
     */
    twitterSite?: string;
};
/**
 * - one page's head
 */
export type HeadMeta = {
    title?: string;
    /**
     * - use `title` as the whole <title>, without the template
     */
    fullTitle?: boolean;
    description?: string | null;
    /**
     * - absolute URL; default siteUrl + path
     */
    canonical?: string | null;
    image?: string | null;
    noindex?: boolean;
    type?: "website" | "article" | "profile" | string;
    jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};
