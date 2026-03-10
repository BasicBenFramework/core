/**
 * PlanetScale adapter using @planetscale/database.
 * Provides serverless MySQL-compatible database.
 */

let planetscale = null

/**
 * Load @planetscale/database dynamically
 */
async function loadDriver() {
  if (planetscale) return planetscale

  try {
    planetscale = await import('@planetscale/database')
    return planetscale
  } catch {
    throw new Error(
      '@planetscale/database is required for PlanetScale support.\n' +
      'Install it with: npm install @planetscale/database'
    )
  }
}

/**
 * Create PlanetScale adapter
 *
 * @param {string} url - PlanetScale connection string
 * @param {Object} options - Additional options
 */
export async function createPlanetScaleAdapter(url, options = {}) {
  const { connect } = await loadDriver()

  // Parse connection string or use options
  const config = url.startsWith('mysql://')
    ? { url }
    : {
        host: options.host || process.env.PLANETSCALE_HOST,
        username: options.username || process.env.PLANETSCALE_USERNAME,
        password: options.password || process.env.PLANETSCALE_PASSWORD
      }

  const conn = connect(config)

  return {
    /**
     * Driver name for query builder
     */
    driver: 'planetscale',

    /**
     * Run INSERT/UPDATE/DELETE
     */
    async run(sql, params = []) {
      const result = await conn.execute(sql, normalizeParams(params))

      return {
        lastInsertRowid: result.insertId ? Number(result.insertId) : null,
        changes: result.rowsAffected
      }
    },

    /**
     * Get single row
     */
    async get(sql, params = []) {
      const result = await conn.execute(sql, normalizeParams(params))
      return result.rows[0] || undefined
    },

    /**
     * Get all rows
     */
    async all(sql, params = []) {
      const result = await conn.execute(sql, normalizeParams(params))
      return result.rows
    },

    /**
     * Execute raw SQL
     * Note: PlanetScale doesn't support multiple statements in one call
     */
    async exec(sql) {
      // Split by semicolon and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      for (const statement of statements) {
        await conn.execute(statement)
      }
    },

    /**
     * Run function in transaction
     * Note: PlanetScale serverless doesn't support traditional transactions
     * This provides a pseudo-transaction for API consistency
     */
    async transaction(fn) {
      // PlanetScale serverless driver doesn't support transactions
      // We execute sequentially and hope for the best
      // For true ACID, use PlanetScale's Boost or a connection pooler
      console.warn(
        'Warning: PlanetScale serverless does not support transactions. ' +
        'Operations will run sequentially without ACID guarantees.'
      )

      const txAdapter = {
        run: this.run.bind(this),
        get: this.get.bind(this),
        all: this.all.bind(this),
        exec: this.exec.bind(this)
      }

      return fn(txAdapter)
    },

    /**
     * Close connection (no-op for serverless)
     */
    async close() {
      // Serverless connections are stateless
    },

    /**
     * Get underlying connection
     */
    get raw() {
      return conn
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
