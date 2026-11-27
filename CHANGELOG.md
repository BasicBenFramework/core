# Changelog

## Unreleased

### Added

- **Page transitions.** `createClientApp({ transitions: true })` animates each
  move to another page, back and forward included, with the browser's View
  Transitions API: a cross-fade by default, styled with `::view-transition-*`
  CSS. Browsers without it, and visitors who prefer reduced motion, navigate
  as before.

### Docs

- How to hydrate a prerendered page instead of rendering it again on load.

## 0.10.0 — 2026-11-25

Search engines and link previews. Before this, every URL of a BasicBen app was
served the same empty `<div id="root">` under one `<title>`, unknown paths
answered 200, and the home page was cached for a day.

### Added

- **Page metadata.** `createClientApp({ head })` sets site-wide defaults
  (`title`, `titleTemplate`, `description`, `siteUrl`, `image`, `locale`,
  `twitterSite`), a route's `head` (an object, or a function of its params)
  sets one page's, and `useHead()` sets what a page learns after fetching. The
  router keeps `<title>`, description, canonical, robots, Open Graph, Twitter
  and JSON-LD tags in step on navigation. Unmatched paths are `noindex`. Apps
  that set neither are left alone. `resolveHead`, `headTags` and `applyHead`
  are exported for custom setups.
- **Prerendering.** `prerender: true` in basicben.config.js (or
  `basicben build --prerender`) renders every route without params or guards
  to its own HTML file with its head tags, plus `404.html`, and with
  `head.siteUrl`, `sitemap.xml` and `robots.txt` (unless `public/` has one).
  `prerender.paths` adds paths such as `/posts/1`. The build keeps the clean
  shell and the route patterns in `dist/client/.basicben/`.
- **Real 404s.** After a prerendering build, `static: { spa: true }` serves a
  prerendered page at its path, the clean shell for client routes that were
  not prerendered, and `404.html` **with a 404 status** for paths no client
  route matches.
- **`trailingSlash: 'redirect'`** answers a GET or HEAD for `/about/` with a
  301 to `/about`, query kept.
- **Compression.** `serveStatic` sends text files of 1 KB and up with brotli
  or gzip, as the client accepts (`compress: false` turns it off). Range
  requests and untrusted mounts are never compressed.
- **Hash links scroll.** Navigating to `/page#section` scrolls to the element
  once the page has rendered, on first load too.

### Changed

- **Static cache policy by file kind.** HTML, `/` included, is `no-cache`
  (it was `max-age=86400`, so a deploy could leave the home page pointing at
  deleted assets for a day). Files under `immutable` paths — `/assets/` by
  default, where Vite writes hashed names — are `public, max-age=31536000,
  immutable`. Everything else keeps `maxAge`.
- **Text types carry `charset=utf-8`** in Content-Type (`text/html`,
  `text/css`, JavaScript, JSON, XML, plain text). `.webmanifest` is served as
  `application/manifest+json`.
- **The generated production entry** (apps without their own server) turns
  on `trailingSlash: 'redirect'`.

## 0.9.0 — 2026-11-24

This release finishes the items the November 2026 review left open: S13 and the
framework P1 list.

### Breaking changes

- **Inserts and updates must name their columns (S13).** `QueryBuilder.insert()` and
  `.update()` throw an error with `code: 'MASS_ASSIGNMENT'` unless the chain calls `only(...)`
  (the model's `fillable` list) or `unguarded()`. `unguarded()` keeps the old behaviour: every
  key except guarded ones, which means `id` unless `except()` says otherwise. `except()` on its
  own no longer permits a write. Raw `db.run()` is unaffected.

  ```js
  await users.insert(req.body)                        // 0.8: writes every key but id. 0.9: throws
  await users.only('name', 'email').insert(req.body)  // both: writes name and email
  await users.unguarded().insert(row)                 // 0.9: the 0.8 behaviour, said out loud
  ```

- **`req.query` keeps repeated keys.** `?tag=a&tag=b` is `{ tag: ['a', 'b'] }`; before, only the
  last value was kept. A key given once is still a string. Code that calls string methods on a
  query value should check `typeof` first.
- **Route params arrive URI-decoded.** `/tags/caf%C3%A9` gives `'café'`, not `'caf%C3%A9'`. A
  route that decoded its params itself now decodes twice. A malformed escape gets a plain `400`
  `{ "error": "Bad Request" }`, and is not logged as a server error. **`%2F` and `%5C` stay
  encoded** in the decoded value, uppercased, so a param or `_catchAll` never gains a separator
  it did not have: `/files/..%2F..%2Fetc%2Fpasswd` gives `'..%2F..%2Fetc%2Fpasswd'`, not
  `'../../etc/passwd'`. Real `..` segments (and `%2e%2e`) never reach a route, because URL
  parsing resolves them first.
- **Route literals are literal.** The `.` in `/feed.xml` used to match any character, and other
  regex characters in a path were live too.
- **Trailing slashes are ignored when matching.** `/about/` reaches the `/about` route. Before,
  it 404'd in production (`Router.match` already normalised them).
- **HEAD falls back to the GET route** when there is no HEAD route. Node sends no body. Before,
  HEAD got a 404.
- **`where(column, null)` is `IS NULL`**, and `where(column, '!=', null)` is `IS NOT NULL`.
  Before, they emitted `= NULL` and `!= NULL`, which match nothing. An ordering operator with
  null (`<`, `>=` …) throws.
- **`undefined` in a where clause throws** an error with `code: 'UNDEFINED_VALUE'`. That applies to
  `where`, `orWhere`, a group, and any member of a `whereIn` list. Only a literal `null` means IS
  NULL: `where('reset_token', req.query.token)` with no token must not match every row with no
  token. On 0.8 it bound `= NULL` and matched nothing.
- **`undefined` values in `insert()` and `update()` are left out**, not written as NULL. An
  update no longer clears a column because an input was missing, and an insert gets the
  column's default. Pass `null` to write NULL. An update whose only values are undefined throws
  "No valid columns".
- **LIKE ignores case on every dialect, the same way.** The builder emits
  `LOWER(col) LIKE LOWER(?) ESCAPE '\'`. Postgres LIKE was case-sensitive, and its default escape
  character (backslash) differed from SQLite's (none). The `LOWER()` call stops a plain index on
  the column from being used. SQLite and Turso fold ASCII only.
- **The client router redirects after render.** `auth` and `guest` guards navigate from an
  effect and render nothing until then. Before, they called `navigate()` during render.
- **Client route patterns use the server's matcher.** `*` is supported on its own or as a
  trailing `/*`; a `*` in the middle of a path is now literal.
- **HEAD responses carry the Content-Length** the GET would have sent, when the route ends the
  response with one `res.end(body)`.
- **The migrator creates `_migrations` when an operation runs**, not when `createMigrator()` is
  called. It also creates `_migrations_lock` on SQLite and Turso.

### Added

- `whereIn`, `whereNotIn`, `orWhere`, `orWhereIn`, `orWhereNull` and `orWhereNotNull`. Grouping
  takes a callback: `where(q => q.where(a).orWhere(b))`. `where(col, 'IN', [...])` expands as
  well. An empty IN list matches nothing, and an empty NOT IN list matches everything.
- `join` and `leftJoin`. Columns can be qualified (`posts.title`, `posts.*`) and aliased
  (`users.name as author`, `users as u`). `update()` and `delete()` refuse a join.
- `escapeLike()`, exported from `@basicbenframework/core` and `/db`.
- A migration lock: `migrate`, `migrate:rollback` and `migrate:fresh` cannot run twice at once.
  Postgres uses a session advisory lock. SQLite and Turso use a row in `_migrations_lock`. A run
  waits up to 10 minutes (the `lockTimeout` option of `createMigrator()`).
  - Postgres falls back to the lock row when an advisory lock would misbehave: a pool of one
    connection, which the lock would hold while every migration waited for it, or a connection
    that looks like a transaction-mode pooler (a Neon `-pooler` host, or port 6432 for
    PgBouncer), where the lock and the unlock can land on different server sessions.
  - `migrationLock` in basicben.config.js (or the `lock` option) chooses outright: `'auto'`,
    `'advisory'`, `'table'`, or `false` for no lock. Behind a pooler the heuristic doesn't
    recognise, set `'table'`.
  - The lock table's creation tolerates two runs creating it at once. A lock row that cannot be
    released is reported alongside the migration's own error, never instead of it.
- `basicben migrate:unlock` (and `migrator.unlock()`) clears a lock row left by a crashed run.
- `export const transaction = false` in a migration runs it outside the transaction wrapper, for
  `CREATE INDEX CONCURRENTLY`, `VACUUM` and `PRAGMA foreign_keys`.
- Client: `Link`, `useSearchParams` and `useSearch`. `navigate()` accepts a query string, a hash
  or a full URL; another origin is a full page load.
- Client config: `authEndpoint` (default `/api/user`; `false` skips the check), `logoutEndpoint`
  (default `/api/auth/logout`), `loginPath` (default `/login`) and `homePath` (default `/`).
- `Router.route()` URI-encodes the values it fills in, so they round-trip through the matcher.

### Fixed

- The server, `Router.match` and the client router share one matcher (`src/routing/match.js`).
  Production used the weakest of the three.
- `navigate('/x?y=1')` renders the `/x` route. Before, it rendered NotFound.
- Signed out, the client app's first render is the page rather than the Loading screen.
- `paginate()` was already safe against `NaN`: junk input falls back to the defaults. This
  release adds a test that no input reaches the SQL as `NaN` or `Infinity`.
