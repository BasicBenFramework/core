/**
 * SQLite adapter using Node.js built-in node:sqlite.
 * Provides synchronous API wrapped for consistency with async Postgres adapter.
 * Requires Node.js 24+ (node:sqlite stabilized in v24 LTS).
 */

import { DatabaseSync } from 'node:sqlite'
import { AsyncLocalStorage } from 'node:async_hooks'
import { serialQueue, withSavepoint } from './transaction.js'

/**
 * @typedef {{ lastInsertRowid: number|bigint, changes: number|bigint }} RunResult
 * @typedef {Record<string, import('node:sqlite').SQLOutputValue>} Row
 */

/**
 * Create SQLite adapter
 *
 * @param {string} url - Path to SQLite database file
 * @param {Object} options - Additional options
 */
export async function createSqliteAdapter(url, options = {}) {
  const dbPath = url.replace('sqlite://', '').replace('file://', '')

  const db = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: true
  })

  // Enable WAL mode for better concurrency
  if (options.wal !== false) {
    db.exec('PRAGMA journal_mode = WAL')
  }

  /*
   * Transactions on one synchronous connection.
   *
   * A single depth counter used to stand in for "a transaction is open". It
   * is shared by everything on this connection, and `fn` is awaited — so
   * while one request's transaction waited on I/O, a second request's
   * `transaction()` saw depth > 0, "joined" it, and was committed or rolled
   * back with the first. Worse, every plain query issued meanwhile ran inside
   * the open transaction and vanished when it rolled back.
   *
   * Now:
   *
   * - Top-level transactions are serialised on a queue: one is open at a time.
   * - A plain query from outside the open transaction waits for it to finish,
   *   queued behind it, instead of running inside it. Outside any transaction
   *   queries stay synchronous, exactly as before.
   * - "Inside" is decided by AsyncLocalStorage, not by which object is called.
   *   Code in `fn` that reaches for the global `db` instead of the handle it
   *   was given still runs in the transaction — queueing it would wait on the
   *   very transaction it belongs to, a deadlock.
   * - A nested `transaction()` inside the open one is a SAVEPOINT, so an inner
   *   failure undoes only the inner work. Nested calls at one level are queued
   *   too, since two savepoints cannot interleave.
   */
  const context = new AsyncLocalStorage()
  const topLevel = serialQueue()
  /** The root of the open top-level transaction, or null. */
  let open = null

  const direct = {
    run(sql, params = []) {
      const stmt = db.prepare(sql)
      const result = stmt.run(...normalizeParams(params))

      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: result.changes
      }
    },

    get(sql, params = []) {
      const stmt = db.prepare(sql)
      return stmt.get(...normalizeParams(params))
    },

    all(sql, params = []) {
      const stmt = db.prepare(sql)
      return stmt.all(...normalizeParams(params))
    },

    exec(sql) {
      db.exec(sql)
    }
  }

  /** Whether the caller is part of the transaction that is open now. */
  const insideOpen = () => open !== null && context.getStore()?.root === open

  /**
   * Run a statement now if that is safe, or after the open transaction.
   * Returns the value directly in the first case and a promise in the second.
   */
  const dispatch = (method) => (...args) => {
    if (open === null || insideOpen()) return direct[method](...args)
    return topLevel(() => direct[method](...args))
  }

  /**
   * The handle a transaction callback receives, for one nesting level.
   *
   * A handle used after its transaction ended — kept in a closure, say — falls
   * back to the connection rather than running inside whichever transaction
   * happens to be open then.
   */
  const makeHandle = (root, depth) => {
    const nested = serialQueue()

    const handle = {
      driver: 'sqlite',

      run: (...args) => (root === open ? direct.run(...args) : adapter.run(...args)),
      get: (...args) => (root === open ? direct.get(...args) : adapter.get(...args)),
      all: (...args) => (root === open ? direct.all(...args) : adapter.all(...args)),
      exec: (...args) => (root === open ? direct.exec(...args) : adapter.exec(...args)),

      transaction(inner) {
        if (root !== open) {
          return Promise.reject(new Error('This transaction has already finished; use db.transaction() to start another.'))
        }

        const child = makeHandle(root, depth + 1)
        return nested(() => withSavepoint(
          direct.exec,
          `bb_savepoint_${depth + 1}`,
          () => context.run({ root, handle: child }, () => inner(child))
        ))
      },

      get raw() {
        return db
      }
    }

    return handle
  }

  const adapter = {
    /**
     * Driver name for query builder
     */
    driver: 'sqlite',

    /**
     * Run INSERT/UPDATE/DELETE. Synchronous, except while a transaction this
     * caller is not part of is open — then a promise, settled after it ends.
     *
     * @type {(sql: string, params?: any) => RunResult | Promise<RunResult>}
     */
    run: dispatch('run'),

    /**
     * Get single row (synchronous or queued, as `run`)
     *
     * @type {(sql: string, params?: any) => Row | undefined | Promise<Row | undefined>}
     */
    get: dispatch('get'),

    /**
     * Get all rows (synchronous or queued, as `run`)
     *
     * @type {(sql: string, params?: any) => Row[] | Promise<Row[]>}
     */
    all: dispatch('all'),

    /**
     * Execute raw SQL (multiple statements; synchronous or queued, as `run`)
     *
     * @type {(sql: string) => void | Promise<void>}
     */
    exec: dispatch('exec'),

    /**
     * Run function in transaction.
     *
     * The callback receives a transaction handle with the same methods, so the
     * same code works against Postgres. The result is awaited: an async
     * callback would otherwise commit before its work finished, and a rejection
     * would escape the rollback.
     *
     * Concurrent calls run one after another, never inside each other; a call
     * made from inside an open transaction is a SAVEPOINT within it. See the
     * comment above `context` for how "inside" is decided.
     *
     * @template T
     * @param {(tx: Object) => T | Promise<T>} fn
     * @returns {Promise<T>}
     */
    async transaction(fn) {
      const current = context.getStore()
      if (current && current.root === open && open !== null) {
        return current.handle.transaction(fn)
      }

      return topLevel(async () => {
        const root = {}
        const handle = makeHandle(root, 0)

        db.exec('BEGIN TRANSACTION')
        open = root

        try {
          const result = await context.run({ root, handle }, () => fn(handle))
          db.exec('COMMIT')
          return result
        } catch (error) {
          // A failed ROLLBACK (SQLite may already have rolled back on its own)
          // must not replace the error that caused it.
          try { db.exec('ROLLBACK') } catch {}
          throw error
        } finally {
          open = null
        }
      })
    },

    /**
     * Close database connection
     */
    close() {
      db.close()
    },

    /**
     * Get underlying DatabaseSync instance
     */
    get raw() {
      return db
    }
  }

  return adapter
}

/**
 * Normalize params to array format
 */
function normalizeParams(params) {
  if (Array.isArray(params)) {
    return params.map(bindable)
  }
  if (params === undefined || params === null) {
    return []
  }
  return [bindable(params)]
}

/**
 * Coerce a JS value into something node:sqlite will accept.
 *
 * node:sqlite rejects booleans outright ("Provided value cannot be bound"),
 * which would make `where('published', true)` throw even though SQLite stores
 * booleans as integers. undefined becomes NULL for the same reason.
 */
function bindable(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === undefined) return null
  return value
}
