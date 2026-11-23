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
export function toNumberedPlaceholders(sql: string): string;
/**
 * Settings for the connection pool.
 *
 * Separate from the adapter so they can be asserted without a Postgres server.
 *
 * @param {string} url - Postgres connection string
 * @param {Object} options - Additional options
 * @returns {Object} Options for pg's Pool
 */
export function poolOptions(url: string, options?: any): any;
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
export function parseInt8(value: string | null): number | string | null;
/**
 * Type parsers for this adapter's pool: pg's own, with int8 replaced.
 *
 * Per pool rather than `pg.types.setTypeParser`, which would change int8 for
 * every pg client in the process, including ones this adapter does not own.
 *
 * @param {{ getTypeParser: Function }} base - `pg.types`
 * @returns {{ getTypeParser: (oid: number, format?: string) => Function }}
 */
export function pgTypes(base: {
    getTypeParser: Function;
}): {
    getTypeParser: (oid: number, format?: string) => Function;
};
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
export function runTransaction(pool: {
    connect: () => Promise<any>;
}, fn: (tx: any) => any): Promise<any>;
/**
 * Create Postgres adapter
 *
 * @param {string} url - Postgres connection string
 * @param {Object} options - Additional options
 */
export function createPostgresAdapter(url: string, options?: any): Promise<{
    /**
     * Driver name for query builder
     */
    driver: string;
    /**
     * Run INSERT/UPDATE/DELETE
     */
    run(sql: any, params?: any[]): Promise<{
        lastInsertRowid: any;
        changes: any;
    }>;
    /**
     * Get single row
     */
    get(sql: any, params?: any[]): Promise<any>;
    /**
     * Get all rows
     */
    all(sql: any, params?: any[]): Promise<any>;
    /**
     * Execute raw SQL
     */
    exec(sql: any): Promise<void>;
    /**
     * Run function in transaction.
     *
     * Runs on one client checked out of the pool; see `runTransaction`.
     */
    transaction(fn: any): Promise<any>;
    /**
     * Close connection pool
     */
    close(): Promise<void>;
    /**
     * Get underlying pool
     */
    readonly raw: any;
}>;
