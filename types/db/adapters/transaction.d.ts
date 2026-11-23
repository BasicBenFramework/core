/**
 * Transaction plumbing shared by the adapters.
 *
 * Two small pieces, both about ordering on a single connection: a queue that
 * runs async tasks one at a time, and nested transactions as SAVEPOINTs.
 */
/**
 * A FIFO queue for async tasks: each starts only after the previous settled.
 *
 * A rejected task does not poison the queue — the next one still runs — but
 * its rejection reaches whoever enqueued it.
 *
 * @returns {<T>(task: () => T | Promise<T>) => Promise<T>}
 */
export function serialQueue(): <T>(task: () => T | Promise<T>) => Promise<T>;
/**
 * Run `inner` inside a savepoint.
 *
 * A nested transaction used to join the outer one, so an inner failure the
 * outer code caught and recovered from still rolled back nothing — or, on
 * Postgres, left the whole transaction aborted. A savepoint makes the inner
 * call what it looks like: its own unit, undone on its own.
 *
 * A failed ROLLBACK TO is swallowed: the original error is the one worth
 * seeing, and the outer transaction will roll back anyway once it propagates.
 *
 * @param {(sql: string) => any} exec - runs one statement on the transaction's connection
 * @param {string} name - savepoint name, unique among the savepoints open at once
 * @param {() => any} inner
 * @returns {Promise<any>}
 */
export function withSavepoint(exec: (sql: string) => any, name: string, inner: () => any): Promise<any>;
