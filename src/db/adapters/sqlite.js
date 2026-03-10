/**
 * SQLite adapter using better-sqlite3.
 * Provides synchronous API wrapped for consistency with async Postgres adapter.
 */

let Database = null

/**
 * Load better-sqlite3 dynamically
 */
async function loadDriver() {
  if (Database) return Database

  try {
    const module = await import('better-sqlite3')
    Database = module.default
    return Database
  } catch {
    throw new Error(
      'better-sqlite3 is required for SQLite support.\n' +
      'Install it with: npm install better-sqlite3'
    )
  }
}

/**
 * Create SQLite adapter
 *
 * @param {string} url - Path to SQLite database file
 * @param {Object} options - Additional options
 */
export async function createSqliteAdapter(url, options = {}) {
  const SqliteDatabase = await loadDriver()

  const dbPath = url.replace('sqlite://', '').replace('file://', '')
  const db = new SqliteDatabase(dbPath, {
    verbose: options.verbose ? console.log : undefined
  })

  // Enable foreign keys by default
  db.pragma('foreign_keys = ON')

  // Enable WAL mode for better concurrency
  if (options.wal !== false) {
    db.pragma('journal_mode = WAL')
  }

  return {
    /**
     * Run INSERT/UPDATE/DELETE
     */
    run(sql, params = []) {
      const stmt = db.prepare(sql)
      const result = stmt.run(...normalizeParams(params))

      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: result.changes
      }
    },

    /**
     * Get single row
     */
    get(sql, params = []) {
      const stmt = db.prepare(sql)
      return stmt.get(...normalizeParams(params))
    },

    /**
     * Get all rows
     */
    all(sql, params = []) {
      const stmt = db.prepare(sql)
      return stmt.all(...normalizeParams(params))
    },

    /**
     * Execute raw SQL (multiple statements)
     */
    exec(sql) {
      db.exec(sql)
    },

    /**
     * Run function in transaction
     */
    transaction(fn) {
      const transaction = db.transaction(fn)
      return transaction()
    },

    /**
     * Close database connection
     */
    close() {
      db.close()
    },

    /**
     * Get underlying better-sqlite3 instance
     */
    get raw() {
      return db
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
