/**
 * Create migrator instance
 *
 * @param {string|string[]} [migrationsDir] - Directory, or directories in the
 *   order they run. Omitted, `migrations` in basicben.config.js, else
 *   `db/migrations`.
 * @param {Object} [connection] - Adapter to use instead of the configured
 *   connection. Tests pass one in to exercise the Postgres dialect, which is
 *   where the bookkeeping SQL differs, without a Postgres server.
 */
export function createMigrator(migrationsDir?: string | string[], connection?: any): Promise<{
    /**
     * Run all pending migrations
     */
    migrate(): Promise<{
        ran: any[];
        message: string;
        batch?: undefined;
    } | {
        ran: string[];
        batch: number;
        message?: undefined;
    }>;
    /**
     * Roll back the last batch of migrations
     */
    rollback(): Promise<{
        rolledBack: any[];
        message: string;
        batch?: undefined;
    } | {
        rolledBack: any[];
        batch: number;
        message?: undefined;
    }>;
    /**
     * Drop all tables and re-run all migrations
     */
    fresh(): Promise<{
        ran: any[];
        message: string;
        batch?: undefined;
    } | {
        ran: string[];
        batch: number;
        message?: undefined;
    }>;
    /**
     * Get migration status
     */
    status(): Promise<{
        name: string;
        ran: boolean;
        batch: any;
    }[]>;
}>;
