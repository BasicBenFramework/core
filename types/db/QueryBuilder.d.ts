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
export function escapeLike(value: string): string;
/**
 * Create a new QueryBuilder instance.
 * Factory function for cleaner syntax.
 *
 * @param {Object} db - Database adapter
 * @param {string} table - Table name
 * @param {string} driver - Database driver
 * @returns {QueryBuilder}
 */
export function query(db: any, table: string, driver?: string): QueryBuilder;
export class QueryBuilder {
    /**
     * Create a new QueryBuilder instance.
     *
     * @param {Object} db - Database adapter instance
     * @param {string} table - Table name
     * @param {string} driver - Database driver ('sqlite' or 'postgres')
     */
    constructor(db: any, table: string, driver?: string);
    db: any;
    grammar: Grammar;
    table: string;
    _fillable: string[];
    _guarded: string[];
    _unguarded: boolean;
    _select: string[];
    _joins: any[];
    _wheres: any[];
    _orderBy: any[];
    _limit: number;
    _offset: number;
    /**
     * Set fillable columns (whitelist).
     * Only these columns will be allowed in insert/update operations; keys of
     * the data outside the list are dropped.
     *
     * @param {...(string|string[])} columns - Column names to allow
     * @returns {QueryBuilder}
     */
    only(...columns: (string | string[])[]): QueryBuilder;
    /**
     * Set guarded columns (blacklist).
     * These columns will be excluded from insert/update operations. On its own
     * this does not permit a write: name the columns with only(), or call
     * unguarded() to write everything else.
     *
     * @param {...(string|string[])} columns - Column names to exclude
     * @returns {QueryBuilder}
     */
    except(...columns: (string | string[])[]): QueryBuilder;
    /**
     * Allow insert()/update() without an only() list.
     *
     * Every key of the data is written, except guarded columns (`id` unless
     * except() says otherwise). This was the default before 0.9.0. Use it for
     * data the code itself built, never for a request body.
     *
     * @returns {QueryBuilder}
     */
    unguarded(): QueryBuilder;
    /**
     * Refuse a write whose columns nobody named.
     *
     * @param {string} operation
     */
    _assertAssignable(operation: string): void;
    /**
     * Filter data object to only allowed columns.
     * Validates identifiers and applies fillable/guarded rules.
     *
     * @param {Object} data - Data object to filter
     * @returns {Object} Filtered data
     * @throws {Error} If an invalid identifier is found
     */
    filterData(data: any): any;
    /**
     * Set columns to select. A column may be qualified (`posts.title`,
     * `posts.*`) and aliased (`users.name as author`).
     *
     * @param {...(string|string[])} columns - Column names
     * @returns {QueryBuilder}
     */
    select(...columns: (string | string[])[]): QueryBuilder;
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
    join(table: string, first: string, operator: string, second?: string): QueryBuilder;
    /**
     * Add a LEFT JOIN. Same arguments as join().
     *
     * @param {string} table
     * @param {string} first
     * @param {string} operator
     * @param {string} [second]
     * @returns {QueryBuilder}
     */
    leftJoin(table: string, first: string, operator: string, second?: string): QueryBuilder;
    _addJoin(type: any, table: any, first: any, operator: any, second: any): this;
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
    where(column: string | ((group: QueryBuilder) => any), operator?: any, value?: any, ...args: any[]): QueryBuilder;
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
    orWhere(column: string | ((group: QueryBuilder) => any), operator?: any, value?: any, ...args: any[]): QueryBuilder;
    _addWhere(bool: any, column: any, operator: any, value: any, argCount: any): this;
    /**
     * Add a WHERE column IN (...) clause. An empty list matches nothing.
     *
     * @param {string} column
     * @param {Array<*>} values
     * @returns {QueryBuilder}
     */
    whereIn(column: string, values: Array<any>): QueryBuilder;
    /**
     * Add a WHERE column NOT IN (...) clause. An empty list matches everything.
     *
     * @param {string} column
     * @param {Array<*>} values
     * @returns {QueryBuilder}
     */
    whereNotIn(column: string, values: Array<any>): QueryBuilder;
    /**
     * whereIn(), joined with OR.
     *
     * @param {string} column
     * @param {Array<*>} values
     * @returns {QueryBuilder}
     */
    orWhereIn(column: string, values: Array<any>): QueryBuilder;
    _addIn(bool: any, column: any, values: any, not: any): this;
    /**
     * Add a WHERE NULL clause.
     *
     * @param {string} column - Column name
     * @returns {QueryBuilder}
     */
    whereNull(column: string): QueryBuilder;
    /**
     * Add a WHERE NOT NULL clause.
     *
     * @param {string} column - Column name
     * @returns {QueryBuilder}
     */
    whereNotNull(column: string): QueryBuilder;
    /**
     * whereNull(), joined with OR.
     *
     * @param {string} column
     * @returns {QueryBuilder}
     */
    orWhereNull(column: string): QueryBuilder;
    /**
     * whereNotNull(), joined with OR.
     *
     * @param {string} column
     * @returns {QueryBuilder}
     */
    orWhereNotNull(column: string): QueryBuilder;
    /**
     * Add ORDER BY clause.
     *
     * @param {string} column - Column name
     * @param {string} [direction='ASC'] - Sort direction
     * @returns {QueryBuilder}
     */
    orderBy(column: string, direction?: string): QueryBuilder;
    /**
     * Set LIMIT.
     *
     * @param {number} n - Number of rows
     * @returns {QueryBuilder}
     */
    limit(n: number): QueryBuilder;
    /**
     * Set OFFSET.
     *
     * @param {number} n - Number of rows to skip
     * @returns {QueryBuilder}
     */
    offset(n: number): QueryBuilder;
    /**
     * A parameter collector. Each bind() returns the next placeholder, so
     * numbering on Postgres follows the order clauses are written in, whatever
     * came before them (an UPDATE's SET list, say).
     */
    _binder(): {
        params: any[];
        bind: (value: any) => string;
    };
    _compileWheres(wheres: any, bind: any): any;
    _compileWhere(w: any, bind: any): string;
    /**
     * Build the WHERE clause SQL.
     *
     * @param {(value: any) => string} bind
     * @returns {string}
     */
    _whereSql(bind: (value: any) => string): string;
    _joinSql(): string;
    _refuseJoins(operation: any): void;
    /**
     * Compile the SELECT and its parameters.
     *
     * @returns {{ sql: string, params: Array<any> }}
     */
    _compileSelect(): {
        sql: string;
        params: Array<any>;
    };
    /**
     * Build SELECT query SQL.
     *
     * @returns {string}
     */
    toSql(): string;
    /**
     * Get the parameters for the current query.
     *
     * @returns {Array}
     */
    getParams(): any[];
    /**
     * Execute SELECT and return all rows.
     *
     * @returns {Promise<Array>}
     */
    get(): Promise<any[]>;
    /**
     * Execute SELECT and return first row.
     *
     * @returns {Promise<Object|undefined>}
     */
    first(): Promise<any | undefined>;
    /**
     * Find a record by ID.
     *
     * @param {number|string} id - The ID to find
     * @returns {Promise<Object|undefined>}
     */
    find(id: number | string): Promise<any | undefined>;
    /**
     * Execute INSERT.
     *
     * Refused unless only() names the columns or unguarded() was called.
     *
     * @param {Object} data - Data to insert
     * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
     */
    insert(data: any): Promise<{
        lastInsertRowid: number;
        changes: number;
    }>;
    /**
     * Execute UPDATE.
     *
     * Refused unless only() names the columns or unguarded() was called.
     *
     * @param {Object} data - Data to update
     * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
     */
    update(data: any): Promise<{
        lastInsertRowid: number;
        changes: number;
    }>;
    /**
     * Execute DELETE.
     *
     * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
     */
    delete(): Promise<{
        lastInsertRowid: number;
        changes: number;
    }>;
    /**
     * Get COUNT of matching rows.
     *
     * @returns {Promise<number>}
     */
    count(): Promise<number>;
    /**
     * Check if any matching rows exist.
     *
     * @returns {Promise<boolean>}
     */
    exists(): Promise<boolean>;
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
    paginate(page?: number | string, perPage?: number | string, options?: {
        maxPerPage?: number;
    }): Promise<{
        data: any[];
        total: number;
        page: number;
        perPage: number;
        totalPages: number;
    }>;
}
import { Grammar } from './Grammar.js';
