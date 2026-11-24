# Changelog

## 0.9.0 — unreleased

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
  route that decoded its params itself now decodes twice. A malformed escape is answered `400`.
- **Route literals are literal.** The `.` in `/feed.xml` used to match any character, and other
  regex characters in a path were live too.
- **Trailing slashes are ignored when matching.** `/about/` reaches the `/about` route. Before,
  it 404'd in production (`Router.match` already normalised them).
- **HEAD falls back to the GET route** when there is no HEAD route. Node sends no body. Before,
  HEAD got a 404.
- **`where(column, null)` is `IS NULL`**, and `where(column, '!=', null)` is `IS NOT NULL`.
  Before, they emitted `= NULL` and `!= NULL`, which match nothing. An ordering operator with
  null (`<`, `>=` …) throws. `where(column, '=', undefined)` is treated as null; before, it was
  read as the two-argument shorthand.
- **LIKE ignores case on every dialect, the same way.** The builder emits
  `LOWER(col) LIKE LOWER(?) ESCAPE '\'`. Postgres LIKE was case-sensitive, and its default escape
  character (backslash) differed from SQLite's (none). The `LOWER()` call stops a plain index on
  the column from being used. SQLite and Turso fold ASCII only.
- **The client router redirects after render.** `auth` and `guest` guards navigate from an
  effect and render nothing until then. Before, they called `navigate()` during render.
- **Client route patterns use the server's matcher.** `*` is supported on its own or as a
  trailing `/*`; a `*` in the middle of a path is now literal.
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
  waits up to 10 minutes (the `lockTimeout` option of `createMigrator()`), and `lock: false`
  turns the lock off.
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
