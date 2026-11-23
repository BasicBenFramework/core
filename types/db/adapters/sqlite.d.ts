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
export function createSqliteAdapter(url: string, options?: any): Promise<{
    /**
     * Driver name for query builder
     */
    driver: string;
    /**
     * Run INSERT/UPDATE/DELETE. Synchronous, except while a transaction this
     * caller is not part of is open — then a promise, settled after it ends.
     *
     * @type {(sql: string, params?: any) => RunResult | Promise<RunResult>}
     */
    run: (sql: string, params?: any) => RunResult | Promise<RunResult>;
    /**
     * Get single row (synchronous or queued, as `run`)
     *
     * @type {(sql: string, params?: any) => Row | undefined | Promise<Row | undefined>}
     */
    get: (sql: string, params?: any) => Row | undefined | Promise<Row | undefined>;
    /**
     * Get all rows (synchronous or queued, as `run`)
     *
     * @type {(sql: string, params?: any) => Row[] | Promise<Row[]>}
     */
    all: (sql: string, params?: any) => Row[] | Promise<Row[]>;
    /**
     * Execute raw SQL (multiple statements; synchronous or queued, as `run`)
     *
     * @type {(sql: string) => void | Promise<void>}
     */
    exec: (sql: string) => void | Promise<void>;
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
    transaction<T>(fn: (tx: any) => T | Promise<T>): Promise<T>;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Get underlying DatabaseSync instance
     */
    readonly raw: DatabaseSync;
}>;
export type RunResult = {
    lastInsertRowid: number | bigint;
    changes: number | bigint;
};
export type Row = Record<string, import("node:sqlite").SQLOutputValue>;
import { DatabaseSync } from 'node:sqlite';
