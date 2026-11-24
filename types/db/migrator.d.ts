/**
 * Create migrator instance
 *
 * migrate, rollback and fresh hold a lock while they run, so two at once —
 * two replicas deploying together — cannot both apply the same migration. The
 * second waits for the first, then finds nothing left to do. On Postgres the
 * lock is a session advisory lock, released by the server if the process
 * dies. Elsewhere it is a row in `_migrations_lock`; a run that crashes leaves
 * the row behind, and `basicben migrate:unlock` (unlock()) clears it.
 *
 * Postgres falls back to the row when an advisory lock can't be trusted: a
 * pool of one connection (the lock would hold it, and every migration would
 * wait for it), or a connection that looks like a transaction-mode pooler — a
 * Neon `-pooler` host or PgBouncer's port 6432 — where the lock and the
 * unlock can land on different server sessions. `migrationLock` in
 * basicben.config.js, or the `lock` option, says which to use outright.
 *
 * @param {string|string[]} [migrationsDir] - Directory, or directories in the
 *   order they run. Omitted, `migrations` in basicben.config.js, else
 *   `db/migrations`.
 * @param {Object} [connection] - Adapter to use instead of the configured
 *   connection. Tests pass one in to exercise the Postgres dialect, which is
 *   where the bookkeeping SQL differs, without a Postgres server.
 * @param {Object} [options]
 * @param {number} [options.lockTimeout] - ms to wait for another run's lock;
 *   default 10 minutes
 * @param {boolean|'auto'|'advisory'|'table'} [options.lock] - which lock:
 *   'auto' (the default) as above, 'advisory' or 'table' to choose, false for
 *   none. Omitted, `migrationLock` in basicben.config.js when the migrator
 *   reads the config itself.
 */
export function createMigrator(migrationsDir?: string | string[], connection?: any, options?: {
    lockTimeout?: number;
    lock?: boolean | "auto" | "advisory" | "table";
}): Promise<{
    /**
     * Run all pending migrations
     */
    migrate(): Promise<any>;
    /**
     * Roll back the last batch of migrations
     */
    rollback(): Promise<any>;
    /**
     * Drop all tables and re-run all migrations
     */
    fresh(): Promise<any>;
    /**
     * Get migration status
     */
    status(): Promise<{
        name: string;
        ran: boolean;
        batch: any;
    }[]>;
    /**
     * Clear a lock row left by a run that crashed. Only for the lock-table
     * backends: Postgres releases its advisory lock when the session ends.
     *
     * @returns {Promise<{ cleared: boolean, holder?: { owner: string, acquired_at: string } }>}
     */
    unlock(): Promise<{
        cleared: boolean;
        holder?: {
            owner: string;
            acquired_at: string;
        };
    }>;
}>;
/**
 * Whether a connection string looks like a transaction-mode pooler, where a
 * session advisory lock is not held by any one session: a Neon `-pooler`
 * host, or PgBouncer's conventional port.
 */
export function looksLikePooler(poolOptions?: {}): boolean;
/**
 * Run `fn` holding the migration lock, waiting up to `timeout` ms for it.
 *
 * @param {Object} db
 * @param {number} timeout
 * @param {'auto'|'advisory'|'table'|(() => Promise<any>)} mode - or `fn`, for 'auto'
 * @param {() => Promise<any>} [fn]
 */
export function withMigrationLock(db: any, timeout: number, mode: "auto" | "advisory" | "table" | (() => Promise<any>), fn?: () => Promise<any>): Promise<any>;
/**
 * The Postgres advisory lock key every `basicben migrate` takes. Arbitrary but
 * fixed: two runs agree on it because they agree on this number.
 */
export const POSTGRES_LOCK_KEY: 726109092026;
