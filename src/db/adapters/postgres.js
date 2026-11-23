/**
 * Postgres adapter using pg (node-postgres).
 * Provides async interface matching the SQLite adapter.
 */

import { serialQueue, withSavepoint } from './transaction.js'

let pg = null

/**
 * Rewrite `?` placeholders as `$1, $2, …`.
 *
 * The query builder already emits the right form through `Grammar`, but
 * hand-written SQL does not, and there is a lot of hand-written SQL: the
 * template's models are full of `WHERE id = ?`. Portable migrations only get an
 * app as far as a schema it then cannot query, so the translation belongs here,
 * once, rather than in every model.
 *
 * Two things are deliberately left alone:
 *
 *  - **Anything inside a string literal.** `WHERE note = 'why?'` binds nothing.
 *  - **jsonb operators.** Postgres spells key-existence `?`, `?|` and `?&`, and
 *    a query written against Postgres on purpose must survive being run.
 *
 * SQL that already uses `$n` is returned untouched, so builder output and
 * anything a user wrote for Postgres directly are both safe.
 *
 * @param {string} sql
 * @returns {string}
 */
export function toNumberedPlaceholders(sql) {
  if (typeof sql !== 'string' || !sql.includes('?')) return sql

  // Already Postgres-shaped. Renumbering would corrupt it.
  if (/\$\d/.test(sql)) return sql

  let out = ''
  let index = 0
  let quote = null

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]

    if (quote) {
      out += char
      // '' inside a single-quoted string is an escaped quote, not the end.
      if (char === quote && sql[i + 1] === quote) {
        out += sql[++i]
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      out += char
      continue
    }

    if (char === '?') {
      const next = sql[i + 1]

      // ?, ?| and ?& are jsonb operators, not placeholders.
      if (next === '?' || next === '|' || next === '&') {
        out += char + next
        i++
        continue
      }

      out += `$${++index}`
      continue
    }

    out += char
  }

  return out
}

/**
 * Load pg dynamically
 */
async function loadDriver() {
  if (pg) return pg

  try {
    pg = await import('pg')
    return pg
  } catch {
    throw new Error(
      'pg is required for Postgres support.\n' +
      'Install it with: npm install pg'
    )
  }
}

/**
 * Settings for the connection pool.
 *
 * Separate from the adapter so they can be asserted without a Postgres server.
 *
 * @param {string} url - Postgres connection string
 * @param {Object} options - Additional options
 * @returns {Object} Options for pg's Pool
 */
export function poolOptions(url, options = {}) {
  return {
    connectionString: url,
    max: options.poolSize || 10,
    idleTimeoutMillis: options.idleTimeout || 30000,
    connectionTimeoutMillis: options.connectionTimeout || 2000,

    // An idle client keeps the event loop alive until it times out, which left
    // every CLI command sitting for the full idle timeout — 30 seconds by
    // default — after its work was done and committed. A long-running server
    // holds itself open with its own listener, so it is unaffected.
    allowExitOnIdle: options.allowExitOnIdle !== false
  }
}

/**
 * Parse an int8 (bigint) column.
 *
 * node-postgres returns int8 as a string, because not every int8 fits in a
 * JavaScript number. In practice the int8s an application sees are COUNT(*),
 * SUM of integers and BIGSERIAL ids, all of which fit — and as strings they
 * compare as text (`"9" > "10"`) and concatenate (`"3" + 1`). So a value that
 * is a safe integer becomes a number; one that is not stays a string rather
 * than silently losing precision. `numeric` is left as a string, since it is
 * usually money and a float would round it.
 *
 * @param {string|null} value
 * @returns {number|string|null}
 */
export function parseInt8(value) {
  if (value === null) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : value
}

/** OID of int8 / bigint. */
const INT8_OID = 20

/**
 * Type parsers for this adapter's pool: pg's own, with int8 replaced.
 *
 * Per pool rather than `pg.types.setTypeParser`, which would change int8 for
 * every pg client in the process, including ones this adapter does not own.
 *
 * @param {{ getTypeParser: Function }} base - `pg.types`
 * @returns {{ getTypeParser: (oid: number, format?: string) => Function }}
 */
export function pgTypes(base) {
  return {
    getTypeParser(oid, format) {
      if (oid === INT8_OID && format !== 'binary') return parseInt8
      return base.getTypeParser(oid, format)
    }
  }
}

/**
 * Run `fn` in a transaction on a client checked out of `pool`.
 *
 * - Nested `tx.transaction()` calls are SAVEPOINTs, so a nested failure the
 *   caller catches undoes only the nested work instead of leaving the whole
 *   transaction in Postgres's "current transaction is aborted" state.
 * - A failed ROLLBACK no longer replaces the error that caused it — that was
 *   the error anyone debugging needed — and the client is released *with* the
 *   failure, so the pool destroys it instead of handing a connection in an
 *   unknown transaction state to the next request.
 *
 * @param {{ connect: () => Promise<any> }} pool
 * @param {(tx: Object) => any} fn
 * @returns {Promise<any>}
 */
export async function runTransaction(pool, fn) {
  const client = await pool.connect()
  let releaseError

  try {
    await client.query('BEGIN')

    const result = await fn(transactionAdapter(client, 0))
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      releaseError = rollbackError
    }
    throw err
  } finally {
    client.release(releaseError)
  }
}

/** The adapter a transaction callback receives, at one nesting level. */
function transactionAdapter(client, depth) {
  const nested = serialQueue()

  const txAdapter = {
    // Carried through deliberately. Anything building SQL from the
    // adapter reads this to pick a dialect — QueryBuilder defaults to
    // SQLite without it, so a query builder used inside a transaction
    // would emit `?` placeholders against Postgres and fail. The migrator
    // does exactly that for its own bookkeeping.
    driver: 'postgres',

    // A savepoint inside the transaction already open, since Postgres refuses
    // a second BEGIN. Migrations run inside one, and a migration that wraps its
    // own work in `db.transaction()` was legal before that; this keeps it
    // legal and makes it mean what it says.
    async transaction(inner) {
      const child = transactionAdapter(client, depth + 1)
      return nested(() => withSavepoint(
        (sql) => client.query(sql),
        `bb_savepoint_${depth + 1}`,
        () => inner(child)
      ))
    },

    async run(sql, params = []) {
      const result = await client.query(toNumberedPlaceholders(sql), normalizeParams(params))
      let lastInsertRowid = null
      if (result.rows && result.rows[0] && result.rows[0].id !== undefined) {
        lastInsertRowid = result.rows[0].id
      }
      return { lastInsertRowid, changes: result.rowCount }
    },
    async get(sql, params = []) {
      const result = await client.query(toNumberedPlaceholders(sql), normalizeParams(params))
      return result.rows[0]
    },
    async all(sql, params = []) {
      const result = await client.query(toNumberedPlaceholders(sql), normalizeParams(params))
      return result.rows
    },
    async exec(sql) {
      await client.query(sql)
    }
  }

  return txAdapter
}

/**
 * Create Postgres adapter
 *
 * @param {string} url - Postgres connection string
 * @param {Object} options - Additional options
 */
export async function createPostgresAdapter(url, options = {}) {
  const loaded = await loadDriver()
  // pg is CommonJS; its exports may arrive on `default` depending on version.
  const driver = loaded.Pool ? loaded : (loaded.default ?? loaded)
  const { Pool } = driver

  const pool = new Pool({ ...poolOptions(url, options), types: pgTypes(driver.types) })

  // Test connection
  try {
    const client = await pool.connect()
    client.release()
  } catch (err) {
    throw new Error(`Failed to connect to Postgres: ${err.message}`)
  }

  return {
    /**
     * Driver name for query builder
     */
    driver: 'postgres',

    /**
     * Run INSERT/UPDATE/DELETE
     */
    async run(sql, params = []) {
      const result = await pool.query(toNumberedPlaceholders(sql), normalizeParams(params))

      // Try to get lastInsertRowid from RETURNING clause
      let lastInsertRowid = null
      if (result.rows && result.rows[0] && result.rows[0].id !== undefined) {
        lastInsertRowid = result.rows[0].id
      }

      return {
        lastInsertRowid,
        changes: result.rowCount
      }
    },

    /**
     * Get single row
     */
    async get(sql, params = []) {
      const result = await pool.query(toNumberedPlaceholders(sql), normalizeParams(params))
      return result.rows[0]
    },

    /**
     * Get all rows
     */
    async all(sql, params = []) {
      const result = await pool.query(toNumberedPlaceholders(sql), normalizeParams(params))
      return result.rows
    },

    /**
     * Execute raw SQL
     */
    async exec(sql) {
      await pool.query(sql)
    },

    /**
     * Run function in transaction.
     *
     * Runs on one client checked out of the pool; see `runTransaction`.
     */
    async transaction(fn) {
      return runTransaction(pool, fn)
    },

    /**
     * Close connection pool
     */
    async close() {
      await pool.end()
    },

    /**
     * Get underlying pool
     */
    get raw() {
      return pool
    }
  }
}

/**
 * Normalize params to array format
 */
function normalizeParams(params) {
  if (Array.isArray(params)) {
    return params
  }
  if (params === undefined || params === null) {
    return []
  }
  return [params]
}
