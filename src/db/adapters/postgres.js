/**
 * Postgres adapter using pg (node-postgres).
 * Provides async interface matching the SQLite adapter.
 */

let pg = null

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
 * Create Postgres adapter
 *
 * @param {string} url - Postgres connection string
 * @param {Object} options - Additional options
 */
export async function createPostgresAdapter(url, options = {}) {
  const { Pool } = await loadDriver()

  const pool = new Pool({
    connectionString: url,
    max: options.poolSize || 10,
    idleTimeoutMillis: options.idleTimeout || 30000,
    connectionTimeoutMillis: options.connectionTimeout || 2000
  })

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
      const result = await pool.query(sql, normalizeParams(params))

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
      const result = await pool.query(sql, normalizeParams(params))
      return result.rows[0]
    },

    /**
     * Get all rows
     */
    async all(sql, params = []) {
      const result = await pool.query(sql, normalizeParams(params))
      return result.rows
    },

    /**
     * Execute raw SQL
     */
    async exec(sql) {
      await pool.query(sql)
    },

    /**
     * Run function in transaction
     */
    async transaction(fn) {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')

        // Create a transaction-scoped adapter
        const txAdapter = {
          async run(sql, params = []) {
            const result = await client.query(sql, normalizeParams(params))
            let lastInsertRowid = null
            if (result.rows && result.rows[0] && result.rows[0].id !== undefined) {
              lastInsertRowid = result.rows[0].id
            }
            return { lastInsertRowid, changes: result.rowCount }
          },
          async get(sql, params = []) {
            const result = await client.query(sql, normalizeParams(params))
            return result.rows[0]
          },
          async all(sql, params = []) {
            const result = await client.query(sql, normalizeParams(params))
            return result.rows
          },
          async exec(sql) {
            await client.query(sql)
          }
        }

        const result = await fn(txAdapter)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
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
