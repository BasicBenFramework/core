/**
 * Neon adapter using @neondatabase/serverless.
 * Provides serverless Postgres with WebSocket support.
 */

let neon = null

/**
 * Load @neondatabase/serverless dynamically
 */
async function loadDriver() {
  if (neon) return neon

  try {
    neon = await import('@neondatabase/serverless')
    return neon
  } catch {
    throw new Error(
      '@neondatabase/serverless is required for Neon support.\n' +
      'Install it with: npm install @neondatabase/serverless'
    )
  }
}

/**
 * Create Neon adapter
 *
 * @param {string} url - Neon connection string (postgres://...)
 * @param {Object} options - Additional options
 */
export async function createNeonAdapter(url, options = {}) {
  const { neon: createNeon, neonConfig } = await loadDriver()

  // Configure for serverless environment
  if (options.fetchConnectionCache !== undefined) {
    neonConfig.fetchConnectionCache = options.fetchConnectionCache
  }

  const sql = createNeon(url)

  return {
    /**
     * Driver name for query builder
     */
    driver: 'neon',

    /**
     * Run INSERT/UPDATE/DELETE
     */
    async run(sqlStr, params = []) {
      const normalizedParams = normalizeParams(params)
      const result = await sql(sqlStr, normalizedParams)

      // Try to get lastInsertRowid from RETURNING clause
      let lastInsertRowid = null
      if (result[0] && result[0].id !== undefined) {
        lastInsertRowid = result[0].id
      }

      return {
        lastInsertRowid,
        changes: result.count || 0
      }
    },

    /**
     * Get single row
     */
    async get(sqlStr, params = []) {
      const normalizedParams = normalizeParams(params)
      const result = await sql(sqlStr, normalizedParams)
      return result[0] || undefined
    },

    /**
     * Get all rows
     */
    async all(sqlStr, params = []) {
      const normalizedParams = normalizeParams(params)
      return sql(sqlStr, normalizedParams)
    },

    /**
     * Execute raw SQL
     */
    async exec(sqlStr) {
      // Split by semicolon and execute each statement
      const statements = sqlStr
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      for (const statement of statements) {
        await sql(statement)
      }
    },

    /**
     * Run function in transaction
     */
    async transaction(fn) {
      const { Pool } = await loadDriver()
      const pool = new Pool({ connectionString: url })
      const client = await pool.connect()

      try {
        await client.query('BEGIN')

        const txAdapter = {
          async run(sqlStr, params = []) {
            const result = await client.query(sqlStr, normalizeParams(params))
            let lastInsertRowid = null
            if (result.rows && result.rows[0] && result.rows[0].id !== undefined) {
              lastInsertRowid = result.rows[0].id
            }
            return { lastInsertRowid, changes: result.rowCount }
          },
          async get(sqlStr, params = []) {
            const result = await client.query(sqlStr, normalizeParams(params))
            return result.rows[0]
          },
          async all(sqlStr, params = []) {
            const result = await client.query(sqlStr, normalizeParams(params))
            return result.rows
          },
          async exec(sqlStr) {
            await client.query(sqlStr)
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
        await pool.end()
      }
    },

    /**
     * Close connection (no-op for serverless)
     */
    async close() {
      // Serverless connections are stateless
    },

    /**
     * Get underlying sql function
     */
    get raw() {
      return sql
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
