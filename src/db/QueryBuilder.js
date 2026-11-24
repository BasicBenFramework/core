/**
 * Query Builder - fluent API for building safe SQL queries.
 * Provides mass assignment protection and identifier escaping.
 */

import { Grammar } from './Grammar.js'

const JOIN_OPERATORS = ['=', '!=', '<>', '<', '>', '<=', '>=']

/**
 * Escape LIKE's wildcards in a value that should match literally.
 *
 * Every LIKE the builder emits declares `\` as its escape character, on every
 * dialect, so this output means the same thing on SQLite and Postgres.
 *
 * @example
 * query.where('title', 'LIKE', `%${escapeLike(req.query.q)}%`)
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`)
}

export class QueryBuilder {
  /**
   * Create a new QueryBuilder instance.
   *
   * @param {Object} db - Database adapter instance
   * @param {string} table - Table name
   * @param {string} driver - Database driver ('sqlite' or 'postgres')
   */
  constructor(db, table, driver = 'sqlite') {
    this.db = db
    this.grammar = new Grammar(driver)

    // Validate and store table name
    this.grammar.validateId(table)
    this.table = table

    // Mass assignment protection. Writes are refused until the caller says
    // which columns they may touch, with only(), or opts out with unguarded().
    this._fillable = null  // Whitelist; null = not given
    this._guarded = ['id']  // Blacklist, applied on top of either
    this._unguarded = false

    // Query state
    this._select = ['*']
    this._joins = []
    this._wheres = []
    this._orderBy = []
    this._limit = null
    this._offset = null
  }

  /**
   * Set fillable columns (whitelist).
   * Only these columns will be allowed in insert/update operations; keys of
   * the data outside the list are dropped.
   *
   * @param {...(string|string[])} columns - Column names to allow
   * @returns {QueryBuilder}
   */
  only(...columns) {
    this._fillable = columns.flat()
    return this
  }

  /**
   * Set guarded columns (blacklist).
   * These columns will be excluded from insert/update operations. On its own
   * this does not permit a write: name the columns with only(), or call
   * unguarded() to write everything else.
   *
   * @param {...(string|string[])} columns - Column names to exclude
   * @returns {QueryBuilder}
   */
  except(...columns) {
    this._guarded = columns.flat()
    return this
  }

  /**
   * Allow insert()/update() without an only() list.
   *
   * Every key of the data is written, except guarded columns (`id` unless
   * except() says otherwise). This was the default before 0.9.0. Use it for
   * data the code itself built, never for a request body.
   *
   * @returns {QueryBuilder}
   */
  unguarded() {
    this._unguarded = true
    return this
  }

  /**
   * Refuse a write whose columns nobody named.
   *
   * @param {string} operation
   */
  _assertAssignable(operation) {
    if (this._fillable !== null || this._unguarded) return

    const err = new Error(
      `${operation}() on "${this.table}" needs the columns it may write. ` +
      `Name them with .only('column', ...) — the model's fillable list — ` +
      `or call .unguarded() to write every key given (except guarded ones). ` +
      'Writes without either are refused since @basicbenframework/core 0.9.0.'
    )
    err.code = 'MASS_ASSIGNMENT'
    throw err
  }

  /**
   * Filter data object to only allowed columns.
   * Validates identifiers and applies fillable/guarded rules.
   *
   * @param {Object} data - Data object to filter
   * @returns {Object} Filtered data
   * @throws {Error} If an invalid identifier is found
   */
  filterData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object')
    }

    const filtered = {}

    for (const [key, value] of Object.entries(data)) {
      // Validate identifier (throws if invalid)
      this.grammar.validateId(key)

      // Check fillable whitelist
      if (this._fillable !== null && !this._fillable.includes(key)) {
        continue
      }

      // Check guarded blacklist
      if (this._guarded.includes(key)) {
        continue
      }

      filtered[key] = value
    }

    return filtered
  }

  /**
   * Set columns to select. A column may be qualified (`posts.title`,
   * `posts.*`) and aliased (`users.name as author`).
   *
   * @param {...(string|string[])} columns - Column names
   * @returns {QueryBuilder}
   */
  select(...columns) {
    const cols = columns.flat()

    this._select = cols.map(col => this.grammar.escapeSelectColumn(col))

    return this
  }

  /**
   * Add an INNER JOIN.
   *
   * @example
   * query.join('users', 'posts.author_id', '=', 'users.id')
   * query.join('users', 'posts.author_id', 'users.id')
   *
   * @param {string} table - Table to join, optionally `table as alias`
   * @param {string} first - Column on one side
   * @param {string} operator - Comparison, or the second column in the
   *   three-argument form
   * @param {string} [second] - Column on the other side
   * @returns {QueryBuilder}
   */
  join(table, first, operator, second) {
    return this._addJoin('INNER', table, first, operator, second)
  }

  /**
   * Add a LEFT JOIN. Same arguments as join().
   *
   * @param {string} table
   * @param {string} first
   * @param {string} operator
   * @param {string} [second]
   * @returns {QueryBuilder}
   */
  leftJoin(table, first, operator, second) {
    return this._addJoin('LEFT', table, first, operator, second)
  }

  _addJoin(type, table, first, operator, second) {
    if (second === undefined) {
      second = operator
      operator = '='
    }

    const op = String(operator)
    if (!JOIN_OPERATORS.includes(op)) {
      throw new Error(`Invalid join operator: ${operator}`)
    }

    this._joins.push({
      type,
      table: this.grammar.escapeTable(table),
      first: this.grammar.escapeColumn(first),
      operator: op,
      second: this.grammar.escapeColumn(second)
    })

    return this
  }

  /**
   * Add a WHERE clause, joined to the previous ones with AND.
   *
   * - `where(column, value)` is `where(column, '=', value)`.
   * - A null value compares with IS NULL (`=`) or IS NOT NULL (`!=`, `<>`).
   * - IN and NOT IN take an array.
   * - LIKE and NOT LIKE are case-insensitive on every dialect, with `\` as the
   *   escape character; see escapeLike().
   * - `where(group => group.where(...).orWhere(...))` adds a parenthesised
   *   group.
   *
   * @param {string|((group: QueryBuilder) => any)} column - Column name, or a
   *   callback that builds a group
   * @param {*} [operator='='] - Comparison operator, or the value itself in the
   *   two-argument shorthand `where(column, value)`
   * @param {*} [value] - Value to compare
   * @returns {QueryBuilder}
   */
  where(column, operator, value) {
    return this._addWhere('AND', column, operator, value, arguments.length)
  }

  /**
   * Add a WHERE clause joined to the previous ones with OR. Same arguments as
   * where(). AND binds tighter than OR, as in SQL: `where(a).orWhere(b).where(c)`
   * is `a OR (b AND c)`; group with a callback to say otherwise.
   *
   * @param {string|((group: QueryBuilder) => any)} column
   * @param {*} [operator]
   * @param {*} [value]
   * @returns {QueryBuilder}
   */
  orWhere(column, operator, value) {
    return this._addWhere('OR', column, operator, value, arguments.length)
  }

  _addWhere(bool, column, operator, value, argCount) {
    if (typeof column === 'function') {
      const group = new QueryBuilder(this.db, this.table, this.grammar.driver)
      column(group)
      if (group._wheres.length > 0) {
        this._wheres.push({ type: 'group', bool, wheres: group._wheres })
      }
      return this
    }

    // Support where(column, value) shorthand
    if (argCount < 3) {
      value = operator
      operator = '='
    }

    const col = this.grammar.escapeColumn(column)
    const op = this.grammar.validateOperator(String(operator))

    if (op === 'IN' || op === 'NOT IN') {
      return this._addIn(bool, column, value, op === 'NOT IN')
    }

    if (value === null || value === undefined) {
      if (op === '=' || op === 'IS') {
        this._wheres.push({ type: 'null', bool, column: col, not: false })
      } else if (op === '!=' || op === '<>' || op === 'IS NOT') {
        this._wheres.push({ type: 'null', bool, column: col, not: true })
      } else {
        throw new Error(`Cannot compare ${column} with null using ${op}; use = or != (IS NULL / IS NOT NULL)`)
      }
      return this
    }

    if (op === 'IS' || op === 'IS NOT') {
      throw new Error(`${op} only compares with null; use = or != for ${column}`)
    }

    this._wheres.push({ type: 'basic', bool, column: col, operator: op, value })
    return this
  }

  /**
   * Add a WHERE column IN (...) clause. An empty list matches nothing.
   *
   * @param {string} column
   * @param {Array<*>} values
   * @returns {QueryBuilder}
   */
  whereIn(column, values) {
    return this._addIn('AND', column, values, false)
  }

  /**
   * Add a WHERE column NOT IN (...) clause. An empty list matches everything.
   *
   * @param {string} column
   * @param {Array<*>} values
   * @returns {QueryBuilder}
   */
  whereNotIn(column, values) {
    return this._addIn('AND', column, values, true)
  }

  /**
   * whereIn(), joined with OR.
   *
   * @param {string} column
   * @param {Array<*>} values
   * @returns {QueryBuilder}
   */
  orWhereIn(column, values) {
    return this._addIn('OR', column, values, false)
  }

  _addIn(bool, column, values, not) {
    if (!Array.isArray(values)) {
      throw new Error(`${not ? 'NOT IN' : 'IN'} on ${column} needs an array of values`)
    }
    this._wheres.push({
      type: 'in',
      bool,
      column: this.grammar.escapeColumn(column),
      values: [...values],
      not
    })
    return this
  }

  /**
   * Add a WHERE NULL clause.
   *
   * @param {string} column - Column name
   * @returns {QueryBuilder}
   */
  whereNull(column) {
    return this._addWhere('AND', column, '=', null, 3)
  }

  /**
   * Add a WHERE NOT NULL clause.
   *
   * @param {string} column - Column name
   * @returns {QueryBuilder}
   */
  whereNotNull(column) {
    return this._addWhere('AND', column, '!=', null, 3)
  }

  /**
   * whereNull(), joined with OR.
   *
   * @param {string} column
   * @returns {QueryBuilder}
   */
  orWhereNull(column) {
    return this._addWhere('OR', column, '=', null, 3)
  }

  /**
   * whereNotNull(), joined with OR.
   *
   * @param {string} column
   * @returns {QueryBuilder}
   */
  orWhereNotNull(column) {
    return this._addWhere('OR', column, '!=', null, 3)
  }

  /**
   * Add ORDER BY clause.
   *
   * @param {string} column - Column name
   * @param {string} [direction='ASC'] - Sort direction
   * @returns {QueryBuilder}
   */
  orderBy(column, direction = 'ASC') {
    const col = this.grammar.escapeColumn(column)
    const dir = this.grammar.validateDirection(direction)

    this._orderBy.push({ column: col, direction: dir })

    return this
  }

  /**
   * Set LIMIT.
   *
   * @param {number} n - Number of rows
   * @returns {QueryBuilder}
   */
  limit(n) {
    const num = parseInt(String(n), 10)
    if (isNaN(num) || num < 0) {
      throw new Error('Limit must be a non-negative integer')
    }
    this._limit = num
    return this
  }

  /**
   * Set OFFSET.
   *
   * @param {number} n - Number of rows to skip
   * @returns {QueryBuilder}
   */
  offset(n) {
    const num = parseInt(String(n), 10)
    if (isNaN(num) || num < 0) {
      throw new Error('Offset must be a non-negative integer')
    }
    this._offset = num
    return this
  }

  /**
   * A parameter collector. Each bind() returns the next placeholder, so
   * numbering on Postgres follows the order clauses are written in, whatever
   * came before them (an UPDATE's SET list, say).
   */
  _binder() {
    const params = []
    const bind = (value) => {
      params.push(value)
      return this.grammar.placeholder(params.length - 1)
    }
    return { params, bind }
  }

  _compileWheres(wheres, bind) {
    return wheres.map((w, i) => {
      const sql = this._compileWhere(w, bind)
      return i === 0 ? sql : `${w.bool} ${sql}`
    }).join(' ')
  }

  _compileWhere(w, bind) {
    switch (w.type) {
      case 'group':
        return `(${this._compileWheres(w.wheres, bind)})`
      case 'null':
        return `${w.column} ${w.not ? 'IS NOT NULL' : 'IS NULL'}`
      case 'in':
        if (w.values.length === 0) return w.not ? '1 = 1' : '1 = 0'
        return `${w.column} ${w.not ? 'NOT IN' : 'IN'} (${w.values.map(bind).join(', ')})`
      default:
        if (w.operator === 'LIKE' || w.operator === 'NOT LIKE') {
          // Postgres LIKE is case-sensitive and SQLite's is not; folding both
          // sides makes every dialect agree. ESCAPE is explicit because the
          // defaults differ too: backslash on Postgres, none on SQLite.
          return `LOWER(${w.column}) ${w.operator} LOWER(${bind(w.value)}) ESCAPE ${this.grammar.likeEscape()}`
        }
        return `${w.column} ${w.operator} ${bind(w.value)}`
    }
  }

  /**
   * Build the WHERE clause SQL.
   *
   * @param {(value: any) => string} bind
   * @returns {string}
   */
  _whereSql(bind) {
    if (this._wheres.length === 0) return ''
    return ` WHERE ${this._compileWheres(this._wheres, bind)}`
  }

  _joinSql() {
    return this._joins.map(j =>
      ` ${j.type} JOIN ${j.table} ON ${j.first} ${j.operator} ${j.second}`
    ).join('')
  }

  _refuseJoins(operation) {
    if (this._joins.length > 0) {
      throw new Error(`${operation}() cannot be combined with join(); the dialects disagree on the syntax`)
    }
  }

  /**
   * Compile the SELECT and its parameters.
   *
   * @returns {{ sql: string, params: Array<any> }}
   */
  _compileSelect() {
    const { params, bind } = this._binder()
    const table = this.grammar.escapeId(this.table)
    let sql = `SELECT ${this._select.join(', ')} FROM ${table}`

    sql += this._joinSql()
    sql += this._whereSql(bind)

    // ORDER BY
    if (this._orderBy.length > 0) {
      const orders = this._orderBy.map(o => `${o.column} ${o.direction}`)
      sql += ` ORDER BY ${orders.join(', ')}`
    }

    // LIMIT
    if (this._limit !== null) {
      sql += ` LIMIT ${this._limit}`
    }

    // OFFSET
    if (this._offset !== null) {
      sql += ` OFFSET ${this._offset}`
    }

    return { sql, params }
  }

  /**
   * Build SELECT query SQL.
   *
   * @returns {string}
   */
  toSql() {
    return this._compileSelect().sql
  }

  /**
   * Get the parameters for the current query.
   *
   * @returns {Array}
   */
  getParams() {
    return this._compileSelect().params
  }

  /**
   * Execute SELECT and return all rows.
   *
   * @returns {Promise<Array>}
   */
  async get() {
    const { sql, params } = this._compileSelect()
    return this.db.all(sql, params)
  }

  /**
   * Execute SELECT and return first row.
   *
   * @returns {Promise<Object|undefined>}
   */
  async first() {
    this._limit = 1
    const { sql, params } = this._compileSelect()
    return this.db.get(sql, params)
  }

  /**
   * Find a record by ID.
   *
   * @param {number|string} id - The ID to find
   * @returns {Promise<Object|undefined>}
   */
  async find(id) {
    return this.where('id', id).first()
  }

  /**
   * Execute INSERT.
   *
   * Refused unless only() names the columns or unguarded() was called.
   *
   * @param {Object} data - Data to insert
   * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
   */
  async insert(data) {
    this._assertAssignable('insert')
    const filtered = this.filterData(data)
    const keys = Object.keys(filtered)
    const values = Object.values(filtered)

    if (keys.length === 0) {
      throw new Error('No valid columns to insert')
    }

    const table = this.grammar.escapeId(this.table)
    const columns = keys.map(k => this.grammar.escapeId(k)).join(', ')
    const placeholders = keys.map((_, i) => this.grammar.placeholder(i)).join(', ')

    let sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`

    if (this.grammar.supportsReturning()) {
      sql += ' RETURNING id'
    }

    return this.db.run(sql, values)
  }

  /**
   * Execute UPDATE.
   *
   * Refused unless only() names the columns or unguarded() was called.
   *
   * @param {Object} data - Data to update
   * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
   */
  async update(data) {
    this._assertAssignable('update')
    this._refuseJoins('update')
    const filtered = this.filterData(data)
    const keys = Object.keys(filtered)

    if (keys.length === 0) {
      throw new Error('No valid columns to update')
    }

    const { params, bind } = this._binder()
    const table = this.grammar.escapeId(this.table)

    const setClause = keys.map(k => `${this.grammar.escapeId(k)} = ${bind(filtered[k])}`).join(', ')

    // WHERE parameters are numbered after the SET ones.
    const sql = `UPDATE ${table} SET ${setClause}${this._whereSql(bind)}`

    return this.db.run(sql, params)
  }

  /**
   * Execute DELETE.
   *
   * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
   */
  async delete() {
    this._refuseJoins('delete')
    const { params, bind } = this._binder()
    const table = this.grammar.escapeId(this.table)
    const sql = `DELETE FROM ${table}${this._whereSql(bind)}`

    return this.db.run(sql, params)
  }

  /**
   * Get COUNT of matching rows.
   *
   * @returns {Promise<number>}
   */
  async count() {
    const { params, bind } = this._binder()
    const table = this.grammar.escapeId(this.table)
    const sql = `SELECT COUNT(*) as count FROM ${table}${this._joinSql()}${this._whereSql(bind)}`

    const result = await this.db.get(sql, params)

    // Postgres returns COUNT(*) as bigint, which node-postgres hands back as a
    // string — "3" > 10 compares as text and "3" + 1 is "31". Coerced here so
    // every driver answers with a number.
    return Number(result?.count ?? 0) || 0
  }

  /**
   * Check if any matching rows exist.
   *
   * @returns {Promise<boolean>}
   */
  async exists() {
    const count = await this.count()
    return count > 0
  }

  /**
   * Paginate results.
   *
   * Both arguments usually come straight from a query string, so they are
   * coerced rather than trusted: anything that is not a positive integer
   * becomes the default, and `perPage` is capped. `parseInt('abc')` used to
   * reach the SQL as `LIMIT NaN` — a 500 — and `?perPage=1000000` read the
   * whole table in one request.
   *
   * @param {number|string} [page] - Page number (1-indexed); default 1
   * @param {number|string} [perPage] - Items per page; default 15, at most `maxPerPage`
   * @param {Object} [options]
   * @param {number} [options.maxPerPage] - default 100
   * @returns {Promise<{ data: Array, total: number, page: number, perPage: number, totalPages: number }>}
   */
  async paginate(page = 1, perPage = 15, options = {}) {
    const maxPerPage = Math.max(1, Math.floor(Number(options.maxPerPage) || 100))
    const toPositive = (value, fallback) => {
      const n = Math.floor(Number(value))
      return Number.isFinite(n) && n >= 1 ? n : fallback
    }

    // Capped too: a page number in the billions is an OFFSET past
    // Number.MAX_SAFE_INTEGER once multiplied, and no table has that page.
    const pageNum = Math.min(toPositive(page, 1), 1_000_000_000)
    const perPageNum = Math.min(toPositive(perPage, 15), maxPerPage)

    // Get total count (clone query state)
    const total = await this.count()

    // Get paginated data
    this._limit = perPageNum
    this._offset = (pageNum - 1) * perPageNum

    const data = await this.get()

    return {
      data,
      total,
      page: pageNum,
      perPage: perPageNum,
      totalPages: Math.ceil(total / perPageNum)
    }
  }
}

/**
 * Create a new QueryBuilder instance.
 * Factory function for cleaner syntax.
 *
 * @param {Object} db - Database adapter
 * @param {string} table - Table name
 * @param {string} driver - Database driver
 * @returns {QueryBuilder}
 */
export function query(db, table, driver = 'sqlite') {
  return new QueryBuilder(db, table, driver)
}
