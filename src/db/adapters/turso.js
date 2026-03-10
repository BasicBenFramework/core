/**
 * Turso adapter using @libsql/client.
 * Provides edge-ready distributed SQLite.
 */

let libsql = null

/**
 * Load @libsql/client dynamically
 */
async function loadDriver() {
  if (libsql) return libsql

  try {
    libsql = await import('@libsql/client')
    return libsql
  } catch {
    throw new Error(
      '@libsql/client is required for Turso support.\n' +
      'Install it with: npm install @libsql/client'
    )
  }
}

/**
 * Create Turso adapter
 *
 * @param {string} url - Turso database URL (libsql://...)
 * @param {Object} options - Additional options
 * @param {string} options.authToken - Turso auth token
 */
export async function createTursoAdapter(url, options = {}) {
  const { createClient } = await loadDriver()

  const client = createClient({
    url,
    authToken: options.authToken || process.env.TURSO_AUTH_TOKEN
  })

  return {
    /**
     * Driver name for query builder
     */
    driver: 'turso',

    /**
     * Run INSERT/UPDATE/DELETE
     */
    async run(sql, params = []) {
      const result = await client.execute({
        sql,
        args: normalizeParams(params)
      })

      return {
        lastInsertRowid: Number(result.lastInsertRowid) || null,
        changes: result.rowsAffected
      }
    },

    /**
     * Get single row
     */
    async get(sql, params = []) {
      const result = await client.execute({
        sql,
        args: normalizeParams(params)
      })

      return result.rows[0] || undefined
    },

    /**
     * Get all rows
     */
    async all(sql, params = []) {
      const result = await client.execute({
        sql,
        args: normalizeParams(params)
      })

      return result.rows
    },

    /**
     * Execute raw SQL (multiple statements)
     */
    async exec(sql) {
      await client.executeMultiple(sql)
    },

    /**
     * Run function in transaction
     */
    async transaction(fn) {
      const tx = await client.transaction('write')

      try {
        const txAdapter = {
          async run(sql, params = []) {
            const result = await tx.execute({
              sql,
              args: normalizeParams(params)
            })
            return {
              lastInsertRowid: Number(result.lastInsertRowid) || null,
              changes: result.rowsAffected
            }
          },
          async get(sql, params = []) {
            const result = await tx.execute({
              sql,
              args: normalizeParams(params)
            })
            return result.rows[0] || undefined
          },
          async all(sql, params = []) {
            const result = await tx.execute({
              sql,
              args: normalizeParams(params)
            })
            return result.rows
          },
          async exec(sql) {
            await tx.executeMultiple(sql)
          }
        }

        const result = await fn(txAdapter)
        await tx.commit()
        return result
      } catch (err) {
        await tx.rollback()
        throw err
      }
    },

    /**
     * Close client connection
     */
    async close() {
      client.close()
    },

    /**
     * Get underlying client
     */
    get raw() {
      return client
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
