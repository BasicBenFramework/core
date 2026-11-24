/**
 * Migration runner.
 * Tracks migrations in _migrations table, runs in order.
 */

import { readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getDb } from './index.js'
import { loadConfig } from '../server/loader.js'
import { refuseLegacyLayout } from './layout.js'
import { Grammar } from './Grammar.js'
import { QueryBuilder } from './QueryBuilder.js'
import { isModuleFile, stripModuleExtension } from '../modules.js'

const MIGRATIONS_TABLE = '_migrations'
const LOCK_TABLE = '_migrations_lock'

/**
 * The Postgres advisory lock key every `basicben migrate` takes. Arbitrary but
 * fixed: two runs agree on it because they agree on this number.
 */
export const POSTGRES_LOCK_KEY = 7261_0909_2026

/** How long a run waits for another to finish before giving up, by default. */
const DEFAULT_LOCK_TIMEOUT = 10 * 60 * 1000
const LOCK_POLL_INTERVAL = 250

/**
 * Grammar for the connected driver.
 *
 * The runner's own bookkeeping is as dialect-sensitive as anything it runs:
 * placeholders are '?' on SQLite and $1, $2 on Postgres, and the two spell the
 * migrations table's DDL differently.
 *
 * It is also handed to every migration as a second argument, so what a user
 * writes can be as portable as what the runner writes. For a long time only the
 * latter was: the framework's own `_migrations` table was built through this
 * grammar while every shipped migration spelled `INTEGER PRIMARY KEY
 * AUTOINCREMENT` literally, so `basicben migrate` against the Postgres option
 * the templates advertise failed on the first table. Migrations taking only
 * `(db)` are unaffected — an extra argument is ignored.
 */
function grammarFor(db) {
  return new Grammar(db.driver || 'sqlite')
}

/**
 * Query builder scoped to the migrations table.
 */
function migrationsTable(db) {
  return new QueryBuilder(db, MIGRATIONS_TABLE, db.driver || 'sqlite')
}

const DEFAULT_DIR = 'db/migrations'

/**
 * The directories migrations come from, in the order they run.
 *
 * One directory, `db/migrations`, unless `basicben.config.js` names a list in
 * `migrations`. A list is for an app whose schema ships in a package: the
 * package's directory first, then the app's own. Names stay bare in
 * `_migrations` whichever directory a file is in, so moving files between
 * directories changes nothing recorded.
 *
 * @param {string|string[]|undefined} given
 * @returns {Promise<string[]>} absolute paths
 */
async function migrationDirs(given) {
  let dirs = given
  if (dirs === undefined) {
    const config = await loadConfig()
    dirs = config.migrations ?? DEFAULT_DIR
  }
  if (!Array.isArray(dirs)) dirs = [dirs]
  if (dirs.length === 0 || dirs.some(d => typeof d !== 'string' || d === '')) {
    throw new Error('migrations must be a directory or a list of directories')
  }

  return dirs.map(d => {
    const dir = resolve(process.cwd(), d)
    // Only the default location has a legacy one to warn about.
    if (d === DEFAULT_DIR) refuseLegacyLayout(dir, 'migrations', DEFAULT_DIR)
    return dir
  })
}

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
export async function createMigrator(migrationsDir = undefined, connection = null, options = {}) {
  const db = connection || await getDb()
  const dirs = await migrationDirs(migrationsDir)
  const lockTimeout = options.lockTimeout ?? DEFAULT_LOCK_TIMEOUT
  const locking = options.lock !== false

  // A name in two directories would be ambiguous in _migrations, which records
  // names only. Refused before anything runs.
  getMigrationFiles(dirs)

  /** Run `fn` holding the migration lock, with the migrations table ready. */
  const exclusive = async (fn) => {
    if (!locking) {
      await ensureMigrationsTable(db)
      return fn()
    }
    return withMigrationLock(db, lockTimeout, async () => {
      // Inside the lock: two CREATE TABLE IF NOT EXISTS racing on Postgres
      // can still fail on the catalogue's unique index.
      await ensureMigrationsTable(db)
      return fn()
    })
  }

  const grammar = grammarFor(db)

  async function runPending() {
    // Read inside the lock, so a run that waited sees what the other applied.
    const pending = await getPendingMigrations(db, dirs)

    if (pending.length === 0) {
      return { ran: [], message: 'Nothing to migrate.' }
    }

    const batch = await getNextBatch(db)
    const ran = []

    for (const migration of pending) {
      const module = await loadMigration(migration.path)

      try {
        if (module.transaction === false) {
          // Opted out, for statements Postgres refuses inside a transaction
          // (CREATE INDEX CONCURRENTLY, VACUUM) or SQLite ignores there
          // (PRAGMA foreign_keys). Nothing is undone on failure, so such a
          // migration should be safe to run again: IF NOT EXISTS and friends.
          await module.up(db, grammar)
          await recordMigration(db, migration.name, batch)
        } else {
          // The migration and the row saying it ran commit together, or
          // neither does. A migration that creates two tables and throws
          // between them used to leave the first one behind and no record of
          // it, so the next `migrate` failed on "table already exists" — with
          // nothing to roll back, because the bookkeeping never happened.
          await atomically(db, async (tx) => {
            await module.up(tx, grammar)
            await recordMigration(tx, migration.name, batch)
          })
        }

        ran.push(migration.name)
      } catch (err) {
        throw new Error(`Migration failed: ${migration.name}\n${err.message}`)
      }
    }

    return { ran, batch }
  }

  return {
    /**
     * Run all pending migrations
     */
    async migrate() {
      return exclusive(runPending)
    },

    /**
     * Roll back the last batch of migrations
     */
    async rollback() {
      return exclusive(async () => {
        const lastBatch = await getLastBatch(db)

        if (!lastBatch) {
          return { rolledBack: [], message: 'Nothing to rollback.' }
        }

        const migrations = await getMigrationsByBatch(db, lastBatch)
        const rolledBack = []

        // Roll back in reverse order
        for (const migration of migrations.reverse()) {
          const filePath = findMigrationFile(dirs, migration.migration)

          if (!filePath) {
            throw new Error(`Migration file not found: ${migration.migration}`)
          }

          const module = await loadMigration(filePath)

          try {
            if (module.transaction === false) {
              await module.down(db, grammar)
              await removeMigration(db, migration.migration)
            } else {
              await atomically(db, async (tx) => {
                await module.down(tx, grammar)
                await removeMigration(tx, migration.migration)
              })
            }

            rolledBack.push(migration.migration)
          } catch (err) {
            throw new Error(`Rollback failed: ${migration.migration}\n${err.message}`)
          }
        }

        return { rolledBack, batch: lastBatch }
      })
    },

    /**
     * Drop all tables and re-run all migrations
     */
    async fresh() {
      return exclusive(async () => {
        // Get all tables. The lock table stays: this run is holding it.
        const tables = (await getAllTables(db)).filter(t => t !== LOCK_TABLE)

        // Nothing here drops in dependency order — the catalogue lists tables
        // arbitrarily — so foreign keys have to be got out of the way. Postgres
        // refuses to drop a table another table references unless told to
        // CASCADE, which drops the dependent constraint, not the dependent
        // table. SQLite has no such clause: it enforces constraints while
        // emptying the table, so a parent with rows referencing it cannot be
        // dropped at all, and enforcement goes off for the duration instead.
        const isPostgres = grammar.isPostgres()
        const cascade = isPostgres ? ' CASCADE' : ''

        if (!isPostgres) {
          await db.exec('PRAGMA foreign_keys = OFF')
        }

        try {
          // Drop all tables (except sqlite internal tables)
          for (const table of tables) {
            if (!table.startsWith('sqlite_')) {
              await db.exec(`DROP TABLE IF EXISTS "${table}"${cascade}`)
            }
          }
        } finally {
          // The SQLite adapter opens every connection with constraints on; a
          // failed drop must not leave this one running without them.
          if (!isPostgres) {
            await db.exec('PRAGMA foreign_keys = ON')
          }
        }

        // Re-create migrations table, and run everything
        await ensureMigrationsTable(db)
        return runPending()
      })
    },

    /**
     * Get migration status
     */
    async status() {
      await ensureMigrationsTable(db)
      const files = getMigrationFiles(dirs)
      const ran = await getRanMigrations(db)
      const ranSet = new Set(ran.map(m => m.migration))

      return files.map(file => ({
        name: file.name,
        ran: ranSet.has(file.name),
        batch: ran.find(m => m.migration === file.name)?.batch || null
      }))
    },

    /**
     * Clear a lock row left by a run that crashed. Only for the lock-table
     * backends: Postgres releases its advisory lock when the session ends.
     *
     * @returns {Promise<{ cleared: boolean, holder?: { owner: string, acquired_at: string } }>}
     */
    async unlock() {
      if (usesAdvisoryLock(db)) return { cleared: false }
      await ensureLockTable(db)
      const holder = await db.get(`SELECT owner, acquired_at FROM ${grammar.escapeId(LOCK_TABLE)} WHERE id = 1`)
      await db.run(`DELETE FROM ${grammar.escapeId(LOCK_TABLE)}`)
      return holder ? { cleared: true, holder } : { cleared: false }
    }
  }
}

/** Postgres with a real pool: a dedicated session can hold an advisory lock. */
function usesAdvisoryLock(db) {
  return grammarFor(db).isPostgres() && typeof db.raw?.connect === 'function'
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Run `fn` holding the migration lock, waiting up to `timeout` ms for it.
 *
 * @param {Object} db
 * @param {number} timeout
 * @param {() => Promise<any>} fn
 */
export async function withMigrationLock(db, timeout, fn) {
  if (usesAdvisoryLock(db)) return withAdvisoryLock(db.raw, timeout, fn)
  return withLockRow(db, timeout, fn)
}

/**
 * Postgres: a session-level advisory lock on a client checked out for the
 * purpose. Session-level because the migrations themselves run in their own
 * transactions on other pooled clients; the lock only has to outlive them.
 */
async function withAdvisoryLock(pool, timeout, fn) {
  const client = await pool.connect()
  let releaseError

  try {
    const deadline = Date.now() + timeout
    for (;;) {
      const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [POSTGRES_LOCK_KEY])
      if (rows[0]?.locked) break
      if (Date.now() >= deadline) {
        throw new Error(
          `Another basicben migrate holds the migration lock (Postgres advisory lock ${POSTGRES_LOCK_KEY}). ` +
          `Waited ${Math.round(timeout / 1000)}s. It is released when that run's connection closes.`
        )
      }
      await sleep(LOCK_POLL_INTERVAL)
    }

    try {
      return await fn()
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [POSTGRES_LOCK_KEY])
      } catch (err) {
        // Destroying the client ends the session, which releases the lock.
        releaseError = err
      }
    }
  } finally {
    client.release(releaseError)
  }
}

async function ensureLockTable(db) {
  const grammar = grammarFor(db)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${grammar.escapeId(LOCK_TABLE)} (
      id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL
    )
  `)
}

/**
 * SQLite, Turso, and anything without a pool to hold a session on: one row
 * with a fixed primary key. Inserting it is taking the lock; a conflict means
 * someone else has it. Deleted, by owner, when the run ends.
 */
async function withLockRow(db, timeout, fn) {
  const grammar = grammarFor(db)
  const table = grammar.escapeId(LOCK_TABLE)
  const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  const ph = (i) => grammar.placeholder(i)

  await ensureLockTable(db)

  const deadline = Date.now() + timeout
  for (;;) {
    let acquired = false
    try {
      const result = await db.run(
        `INSERT INTO ${table} (id, owner, acquired_at) VALUES (1, ${ph(0)}, ${ph(1)}) ON CONFLICT DO NOTHING`,
        [owner, new Date().toISOString()]
      )
      acquired = Number(result?.changes) === 1
    } catch (err) {
      // Another process mid-write on the same SQLite file: try again.
      if (!/busy|locked/i.test(String(err?.message))) throw err
    }
    if (acquired) break

    if (Date.now() >= deadline) {
      const holder = await db.get(`SELECT owner, acquired_at FROM ${table} WHERE id = 1`)
      throw new Error(
        `Another basicben migrate holds the migration lock` +
        (holder ? ` (${holder.owner}, since ${holder.acquired_at})` : '') +
        `. Waited ${Math.round(timeout / 1000)}s. ` +
        'If no other run is going, one crashed and left the lock behind: `basicben migrate:unlock` clears it.'
      )
    }
    await sleep(LOCK_POLL_INTERVAL)
  }

  try {
    return await fn()
  } finally {
    await db.run(`DELETE FROM ${table} WHERE id = 1 AND owner = ${ph(0)}`, [owner])
  }
}

/**
 * Run one migration's work and its bookkeeping as a single unit.
 *
 * Both drivers do transactional DDL, so a migration that throws halfway leaves
 * the schema as it was rather than half-changed. That failure was not
 * hypothetical: a rollback that died between two `down` steps left a database
 * where the next `migrate` failed with "column slug already exists", and the
 * only way out was editing `_migrations` by hand.
 *
 * The callback gets the transaction-scoped adapter and everything must go
 * through it. On Postgres the outer `db` is a *pool*, so a statement sent to it
 * from inside here would take a different connection and land outside the
 * transaction — committed while the rest rolled back.
 *
 * An adapter with no `transaction` runs unwrapped. That is what a custom
 * adapter had before this existed; it is not a guarantee being dropped
 * quietly, it is one that was never available.
 *
 * Postgres refuses `CREATE INDEX CONCURRENTLY` and `VACUUM` inside a
 * transaction, and SQLite ignores `PRAGMA foreign_keys` there — the
 * table-rebuild pattern that relies on turning it off has to do so outside. A
 * migration that needs either exports `transaction = false` and runs
 * unwrapped.
 *
 * @param {Object} db
 * @param {(tx: Object) => Promise<void>} work
 */
async function atomically(db, work) {
  if (typeof db.transaction !== 'function') return work(db)

  return db.transaction(work)
}

/**
 * Create migrations table if it doesn't exist
 */
async function ensureMigrationsTable(db) {
  const grammar = grammarFor(db)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${grammar.escapeId(MIGRATIONS_TABLE)} (
      id ${grammar.autoIncrementPrimaryKey()},
      migration TEXT NOT NULL UNIQUE,
      batch INTEGER NOT NULL,
      ran_at ${grammar.timestampType()} DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/**
 * Migration files from each directory in turn, lexically within each.
 *
 * A missing directory is empty. A name found twice is an error naming both
 * files: `_migrations` records names, not paths, so two files with one name
 * could never be told apart again.
 *
 * @param {string[]} dirs - absolute paths
 */
function getMigrationFiles(dirs) {
  const files = []
  const seen = new Map()

  for (const dir of dirs) {
    if (!existsSync(dir)) continue

    for (const f of readdirSync(dir).filter(isModuleFile).sort()) {
      const file = { name: stripModuleExtension(f), path: join(dir, f) }
      const other = seen.get(file.name)
      if (other) {
        throw new Error(`Two migrations are named ${file.name}:\n  ${other}\n  ${file.path}\nRename one; _migrations records names, not paths.`)
      }
      seen.set(file.name, file.path)
      files.push(file)
    }
  }

  return files
}

/**
 * Get migrations that haven't been run
 */
async function getPendingMigrations(db, dirs) {
  const files = getMigrationFiles(dirs)
  const ran = await getRanMigrations(db)
  const ranSet = new Set(ran.map(m => m.migration))

  return files.filter(f => !ranSet.has(f.name))
}

/**
 * Get all ran migrations
 */
async function getRanMigrations(db) {
  return migrationsTable(db).orderBy('batch').orderBy('id').get()
}

/**
 * Get the highest batch number, or 0 if nothing has run.
 *
 * MAX() takes no parameters, so this one query is portable as written.
 */
async function getMaxBatch(db) {
  const table = grammarFor(db).escapeId(MIGRATIONS_TABLE)
  const result = await db.get(`SELECT MAX(batch) AS max FROM ${table}`)

  // Postgres returns null for an empty table; SQLite returns null too.
  return Number(result?.max) || 0
}

/**
 * Get next batch number
 */
async function getNextBatch(db) {
  return (await getMaxBatch(db)) + 1
}

/**
 * Get last batch number
 */
async function getLastBatch(db) {
  return (await getMaxBatch(db)) || null
}

/**
 * Get migrations by batch
 */
async function getMigrationsByBatch(db, batch) {
  return migrationsTable(db).where('batch', batch).orderBy('id').get()
}

/**
 * Record that a migration has run
 */
async function recordMigration(db, name, batch) {
  await migrationsTable(db).only('migration', 'batch').insert({ migration: name, batch })
}

/**
 * Remove migration record
 */
async function removeMigration(db, name) {
  await migrationsTable(db).where('migration', name).delete()
}

/**
 * Load migration module
 */
async function loadMigration(filePath) {
  const fileUrl = pathToFileURL(filePath).href
  return import(fileUrl)
}

/**
 * Find migration file by name, in any of the directories
 */
function findMigrationFile(dirs, name) {
  const files = getMigrationFiles(dirs)
  const match = files.find(f => f.name === name)
  return match?.path || null
}

/**
 * Get all table names (for fresh command)
 */
async function getAllTables(db) {
  // Ask the driver we actually connected to. Probing SQLite's catalogue first
  // and falling back on error can't work: the SQLite adapter is synchronous, so
  // a failing query throws before there is a promise to catch.
  if (grammarFor(db).isPostgres()) {
    const tables = await db.all(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )
    return tables.map(t => t.tablename)
  }

  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  )
  return tables.map(t => t.name)
}
