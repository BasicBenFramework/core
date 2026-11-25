/**
 * Create a BasicBen server instance
 */
export function createServer(options?: {}): Promise<{
    use: (...handlers: any[]) => /*elided*/ any;
    server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
    get: (path: any, ...handlers: any[]) => /*elided*/ any;
    post: (path: any, ...handlers: any[]) => /*elided*/ any;
    put: (path: any, ...handlers: any[]) => /*elided*/ any;
    patch: (path: any, ...handlers: any[]) => /*elided*/ any;
    delete: (path: any, ...handlers: any[]) => /*elided*/ any;
    head: (path: any, ...handlers: any[]) => /*elided*/ any;
    options: (path: any, ...handlers: any[]) => /*elided*/ any;
    listen(port: any, callback: any): /*elided*/ any;
    close(callback: any): void;
}>;
/**
 * 301 from `/path/` to `/path`, keeping the query string. GET and HEAD only:
 * a redirected POST would lose its body in some clients. `/` is left alone,
 * and so is `//`, which is not a path to redirect but an open-redirect probe.
 */
export function redirectTrailingSlash(req: any, res: any, next: any): any;
/**
 * Response helpers - added to res object
 */
export function addResponseHelpers(req: any, res: any, next: any): void;
export { createApp } from "./http.js";
export { cors } from "./cors.js";
export { serveStatic } from "./static.js";
export { Router, createRouter } from "./router.js";
export { bodyParser, json } from "./body-parser.js";
export { securityHeaders, DEFAULT_SECURITY_HEADERS } from "./security-headers.js";
export { appKey, assertAppKey } from "./app-key.js";
export { loadRoutes, loadMiddleware, loadConfig } from "./loader.js";
export { hooks, HOOKS } from "../hooks/index.js";
export { getEnvironment, isCloud, isSelfHosted, getVersion } from "./environment.js";
