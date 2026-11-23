/**
 * Read `.env` into the process environment.
 *
 * Every command needs this, not just the ones that start a server. `basicben
 * migrate` did not, so a project that set `DATABASE_URL` in `.env` — which is
 * what the generated `.env` tells you to do — migrated its SQLite default while
 * the server it then started read `.env` and connected to Postgres. Both
 * reported success, against different databases, and the app came up against an
 * empty schema.
 *
 * A value already in the environment wins. `.env` is a default, not an
 * override: that is what dotenv does, what Node's own `--env-file` does, and
 * what every host that injects configuration assumes. Overwriting meant
 * `DATABASE_URL=... basicben migrate` silently used the file's value instead.
 *
 * Parsed with Node's own `util.parseEnv` — the parser behind the
 * `--env-file` flag that `dev` and `start` use — so every command reads a value
 * the same way. The hand-rolled parser this replaces kept the quotes around
 * `APP_KEY="abc"`, so `migrate` and the server it started disagreed about the
 * key itself.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

/**
 * @param {string} [cwd] - directory to look for .env in
 * @returns {boolean} whether a file was found
 */
export function loadEnv(cwd = process.cwd()) {
  const envPath = resolve(cwd, '.env')

  if (!existsSync(envPath)) return false

  const parsed = parseEnv(readFileSync(envPath, 'utf-8'))

  for (const [name, value] of Object.entries(parsed)) {
    if (process.env[name] === undefined) {
      process.env[name] = value
    }
  }

  return true
}
