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
 * @param {string|string[]} [migrationsDir] - Directory, or directories in the
 *   order they run. Omitted, `migrations` in basicben.config.js, else
 *   `db/migrations`.
 * @param {Object} [connection] - Adapter to use instead of the configured
 *   connection. Tests pass one in to exercise the Postgres dialect, which is
 *   where the bookkeeping SQL differs, without a Postgres server.
 * @param {Object} [options]
 * @param {number} [options.lockTimeout] - ms to wait for another run's lock;
 *   default 10 minutes
 * @param {boolean} [options.lock] - false runs without the lock
 */
export function createMigrator(migrationsDir?: string | string[], connection?: any, options?: {
    lockTimeout?: number;
    lock?: boolean;
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
 * Run `fn` holding the migration lock, waiting up to `timeout` ms for it.
 *
 * @param {Object} db
 * @param {number} timeout
 * @param {() => Promise<any>} fn
 */
export function withMigrationLock(db: any, timeout: number, fn: () => Promise<any>): Promise<any>;
/**
 * The Postgres advisory lock key every `basicben migrate` takes. Arbitrary but
 * fixed: two runs agree on it because they agree on this number.
 */
export const POSTGRES_LOCK_KEY: 726109092026;
