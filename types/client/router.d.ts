/**
 * A route entry: either the component itself, or the component plus its guards.
 *
 * @typedef {import('react').ComponentType<any> | {
 *   component: import('react').ComponentType<any>,
 *   auth?: boolean,
 *   guest?: boolean,
 *   layout?: import('react').ComponentType<any> | null
 * }} RouteDefinition
 */
/**
 * Create a client-side React app with routing
 *
 * @param {object} config
 * @param {Record<string, RouteDefinition>} config.routes - Route definitions { path: Component | { component, auth?, guest?, layout? } }
 * @param {import('react').ComponentType<any>} [config.layout] - Default layout wrapper
 * @param {(path: string) => Promise<any>} [config.api] - API function for the auth check; called
 *   with `authEndpoint`, resolves to `{ user }` (default: fetch with the stored bearer token)
 * @param {string | false} [config.authEndpoint] - Where the signed-in user is read from on
 *   load (default `/api/user`). `false` skips the check: nobody is signed in until
 *   `setUser` says so.
 * @param {string | false} [config.logoutEndpoint] - POSTed on logout so the server can end
 *   the session (default `/api/auth/logout`); `false` skips it
 * @param {string} [config.loginPath] - Where an `auth` route sends a signed-out visitor
 *   (default `/login`)
 * @param {string} [config.homePath] - Where a `guest` route sends a signed-in visitor
 *   (default `/`)
 * @param {import('react').ComponentType<any>} [config.Loading] - Loading component
 * @param {import('react').ComponentType<any>} [config.NotFound] - Component rendered when no route matches.
 *   Receives no props and is wrapped in the default layout, so an unmatched path
 *   keeps the site's navigation instead of rendering a bare string.
 * @param {import('react').ComponentType<{children: any}>} [config.provider] - Wraps the
 *   entire tree, outside the auth and router contexts. Use it for anything every
 *   route needs and that must survive navigation — a query client, a data
 *   cache, an error boundary.
 * @returns {import('react').FunctionComponent} React component
 */
export function createClientApp(config: {
    routes: Record<string, RouteDefinition>;
    layout?: import("react").ComponentType<any>;
    api?: (path: string) => Promise<any>;
    authEndpoint?: string | false;
    logoutEndpoint?: string | false;
    loginPath?: string;
    homePath?: string;
    Loading?: import("react").ComponentType<any>;
    NotFound?: import("react").ComponentType<any>;
    provider?: import("react").ComponentType<{
        children: any;
    }>;
}): import("react").FunctionComponent;
/**
 * A route entry: either the component itself, or the component plus its guards.
 */
export type RouteDefinition = import("react").ComponentType<any> | {
    component: import("react").ComponentType<any>;
    auth?: boolean;
    guest?: boolean;
    layout?: import("react").ComponentType<any> | null;
};
