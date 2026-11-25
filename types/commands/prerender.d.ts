/**
 * @param {string} cwd - the app's root
 * @param {string} outDir - the client build, relative to cwd
 * @param {PrerenderOptions} [options]
 * @returns {Promise<{ pages: string[] }>}
 */
export function prerender(cwd: string, outDir: string, options?: PrerenderOptions): Promise<{
    pages: string[];
}>;
/**
 * Prerender: write each page's HTML at build time.
 *
 * The client renders in the browser, so without this every URL is served the
 * same empty `<div id="root">` under one <title>. Search engines that run
 * JavaScript do so late and not always; link previews and most other crawlers
 * never do. This renders every static route to HTML with its own head tags
 * (from createClientApp's `head` and each route's `head`) and writes:
 *
 *   /               → index.html
 *   /docs           → docs.html            served at /docs by spaFallback, and by
 *   /docs/routing   → docs/routing.html    Cloudflare Pages, Netlify and Vercel (cleanUrls)
 *   unmatched paths → 404.html             noindex; served with a 404 status
 *   .basicben/shell.html                   the clean shell, for client routes not prerendered
 *   .basicben/routes.json                  every client route pattern, so the server can
 *                                          answer a path none matches with a real 404
 *   sitemap.xml, robots.txt                when `head.siteUrl` is set (robots.txt only if
 *                                          the app's public/ has none)
 *
 * Prerendered: routes without params and without `auth`/`guest` guards, plus
 * any `paths` listed in the config. The browser still mounts the app as before
 * and renders the page afresh, so behaviour does not change; the markup is for
 * crawlers, previews and the first paint.
 *
 * During the render `window.location` is the page's URL and nothing else of
 * the browser exists: a component that reads `window`, `document` or
 * `localStorage` while rendering (not in an effect) fails the build, with the
 * route named.
 *
 * Turned on by `prerender: true` (or an object, below) in basicben.config.js,
 * or `basicben build --prerender`.
 */
export type PrerenderOptions = {
    /**
     * - the module whose default export is createClientApp's result;
     * default the first of src/routes/App.{tsx,jsx,ts,js}
     */
    entry?: string;
    /**
     * - extra paths to render, e.g. `/posts/1` for a param route
     */
    paths?: string[];
    /**
     * - write 404.html (default true)
     */
    notFound?: boolean;
    /**
     * - write sitemap.xml and robots.txt when siteUrl is known (default true)
     */
    sitemap?: boolean;
};
