/**
 * Migration runner.
 * Tracks migrations in _migrations table, runs in order.
 */

import { readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDb } from './index.js'

const MIGRATIONS_TABLE = '_migrations'

/**
 * Create migrator instance
 */
export async function createMigrator(migrationsDir = 'migrations') {
  const db = await getDb()
  const dir = resolve(process.cwd(), migrationsDir)

  // Ensure migrations table exists
  await ensureMigrationsTable(db)

  return {
    /**
     * Run all pending migrations
     */
    async migrate() {
      const pending = await getPendingMigrations(db, dir)

      if (pending.length === 0) {
        return { ran: [], message: 'Nothing to migrate.' }
      }

      const batch = await getNextBatch(db)
      const ran = []

      for (const migration of pending) {
        const module = await loadMigration(migration.path)

        try {
          await module.up(db)
          await recordMigration(db, migration.name, batch)
          ran.push(migration.name)
        } catch (err) {
          throw new Error(`Migration failed: ${migration.name}\n${err.message}`)
        }
      }

      return { ran, batch }
    },

    /**
     * Roll back the last batch of migrations
     */
    async rollback() {
      const lastBatch = await getLastBatch(db)

      if (!lastBatch) {
        return { rolledBack: [], message: 'Nothing to rollback.' }
      }

      const migrations = await getMigrationsByBatch(db, lastBatch)
      const rolledBack = []

      // Roll back in reverse order
      for (const migration of migrations.reverse()) {
        const filePath = findMigrationFile(dir, migration.migration)

        if (!filePath) {
          throw new Error(`Migration file not found: ${migration.migration}`)
        }

        const module = await loadMigration(filePath)

        try {
          await module.down(db)
          await removeMigration(db, migration.migration)
          rolledBack.push(migration.migration)
        } catch (err) {
          throw new Error(`Rollback failed: ${migration.migration}\n${err.message}`)
        }
      }

      return { rolledBack, batch: lastBatch }
    },

    /**
     * Drop all tables and re-run all migrations
     */
    async fresh() {
      // Get all tables
      const tables = await getAllTables(db)

      // Drop all tables (except sqlite internal tables)
      for (const table of tables) {
        if (!table.startsWith('sqlite_')) {
          await db.exec(`DROP TABLE IF EXISTS "${table}"`)
        }
      }

      // Re-create migrations table
      await ensureMigrationsTable(db)

      // Run all migrations
      return this.migrate()
    },

    /**
     * Get migration status
     */
    async status() {
      const files = getMigrationFiles(dir)
      const ran = await getRanMigrations(db)
      const ranSet = new Set(ran.map(m => m.migration))

      return files.map(file => ({
        name: file.name,
        ran: ranSet.has(file.name),
        batch: ran.find(m => m.migration === file.name)?.batch || null
      }))
    }
  }
}

/**
 * Create migrations table if it doesn't exist
 */
async function ensureMigrationsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration TEXT NOT NULL UNIQUE,
      batch INTEGER NOT NULL,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/**
 * Get list of migration files
 */
function getMigrationFiles(dir) {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .sort()
    .map(f => ({
      name: f.replace('.js', ''),
      path: join(dir, f)
    }))
}

/**
 * Get migrations that haven't been run
 */
async function getPendingMigrations(db, dir) {
  const files = getMigrationFiles(dir)
  const ran = await getRanMigrations(db)
  const ranSet = new Set(ran.map(m => m.migration))

  return files.filter(f => !ranSet.has(f.name))
}

/**
 * Get all ran migrations
 */
async function getRanMigrations(db) {
  return db.all(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY batch, id`)
}

/**
 * Get next batch number
 */
async function getNextBatch(db) {
  const result = await db.get(`SELECT MAX(batch) as max FROM ${MIGRATIONS_TABLE}`)
  return (result?.max || 0) + 1
}

/**
 * Get last batch number
 */
async function getLastBatch(db) {
  const result = await db.get(`SELECT MAX(batch) as max FROM ${MIGRATIONS_TABLE}`)
  return result?.max || null
}

/**
 * Get migrations by batch
 */
async function getMigrationsByBatch(db, batch) {
  return db.all(`SELECT * FROM ${MIGRATIONS_TABLE} WHERE batch = ? ORDER BY id`, [batch])
}

/**
 * Record that a migration has run
 */
async function recordMigration(db, name, batch) {
  await db.run(
    `INSERT INTO ${MIGRATIONS_TABLE} (migration, batch) VALUES (?, ?)`,
    [name, batch]
  )
}

/**
 * Remove migration record
 */
async function removeMigration(db, name) {
  await db.run(`DELETE FROM ${MIGRATIONS_TABLE} WHERE migration = ?`, [name])
}

/**
 * Load migration module
 */
async function loadMigration(filePath) {
  const fileUrl = pathToFileURL(filePath).href
  return import(fileUrl)
}

/**
 * Find migration file by name
 */
function findMigrationFile(dir, name) {
  const files = getMigrationFiles(dir)
  const match = files.find(f => f.name === name)
  return match?.path || null
}

/**
 * Get all table names (for fresh command)
 */
async function getAllTables(db) {
  // SQLite
  const sqliteTables = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).catch(() => [])

  if (sqliteTables.length > 0) {
    return sqliteTables.map(t => t.name)
  }

  // Postgres
  const pgTables = await db.all(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  ).catch(() => [])

  return pgTables.map(t => t.tablename)
}
