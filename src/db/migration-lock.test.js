/**
 * The migration lock, and migrations that opt out of the transaction wrapper.
 *
 * Real SQLite files, two connections to one file standing in for two
 * replicas. The Postgres advisory lock is exercised with a fake pool here and
 * against a real server when TEST_POSTGRES_URL is set.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteAdapter } from './adapters/sqlite.js'
import { createMigrator, withMigrationLock, POSTGRES_LOCK_KEY } from './migrator.js'

let root
let dir
let file
const open = []

async function connect() {
  const db = await createSqliteAdapter(file)
  open.push(db)
  return db
}

function migration(name, source) {
  writeFileSync(join(dir, `${name}.js`), source)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'basicben-lock-'))
  dir = join(root, 'migrations')
  mkdirSync(dir)
  file = join(root, 'test.db')
})

afterEach(() => {
  for (const db of open.splice(0)) db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('export const transaction = false', () => {
  test('runs the migration outside a transaction', async () => {
    // PRAGMA foreign_keys is a no-op inside a transaction, which is exactly
    // the case the opt-out exists for.
    migration('001_pragma', `
      export const transaction = false
      export const up = async (db) => {
        await db.exec('PRAGMA foreign_keys = OFF')
        const { foreign_keys } = await db.get('PRAGMA foreign_keys')
        await db.exec('CREATE TABLE seen (value INTEGER)')
        await db.run('INSERT INTO seen (value) VALUES (?)', [foreign_keys])
        await db.exec('PRAGMA foreign_keys = ON')
      }
      export const down = async (db) => { await db.exec('DROP TABLE seen') }
    `)
    migration('002_wrapped', `
      export const up = async (db) => {
        await db.exec('PRAGMA foreign_keys = OFF')
        const { foreign_keys } = await db.get('PRAGMA foreign_keys')
        await db.run('INSERT INTO seen (value) VALUES (?)', [foreign_keys])
      }
      export const down = async () => {}
    `)

    const db = await connect()
    const { ran } = await (await createMigrator(dir, db)).migrate()

    assert.deepStrictEqual(ran, ['001_pragma', '002_wrapped'])
    const values = db.all('SELECT value FROM seen').map(r => r.value)
    assert.deepStrictEqual(values, [0, 1], 'off outside a transaction, ignored inside one')
    assert.deepStrictEqual(db.all('SELECT migration FROM _migrations').map(r => r.migration), ['001_pragma', '002_wrapped'])
  })

  test('a failure is not rolled back, and is not recorded', async () => {
    migration('001_half', `
      export const transaction = false
      export const up = async (db) => {
        await db.exec('CREATE TABLE IF NOT EXISTS kept (id INTEGER)')
        throw new Error('deliberate')
      }
      export const down = async () => {}
    `)

    const db = await connect()
    await assert.rejects((await createMigrator(dir, db)).migrate(), /Migration failed: 001_half/)
    assert.ok(db.get("SELECT name FROM sqlite_master WHERE name = 'kept'"))
    assert.strictEqual(db.all('SELECT * FROM _migrations').length, 0)
  })

  test('rollback honours it too', async () => {
    migration('001_t', `
      export const transaction = false
      export const up = async (db) => { await db.exec('CREATE TABLE t (id INTEGER)') }
      export const down = async (db) => {
        await db.exec('PRAGMA foreign_keys = OFF')
        const { foreign_keys } = await db.get('PRAGMA foreign_keys')
        await db.exec('PRAGMA foreign_keys = ON')
        if (foreign_keys !== 0) throw new Error('down ran inside a transaction')
        await db.exec('DROP TABLE t')
      }
    `)

    const db = await connect()
    const migrator = await createMigrator(dir, db)
    await migrator.migrate()
    const { rolledBack } = await migrator.rollback()
    assert.deepStrictEqual(rolledBack, ['001_t'])
  })
})

describe('the migration lock (lock row)', () => {
  test('two concurrent migrate runs apply each migration once', async () => {
    migration('001_slow', `
      export const up = async (db) => {
        await db.exec('CREATE TABLE runs (n INTEGER)')
        await db.run('INSERT INTO runs (n) VALUES (1)')
        await new Promise(r => setTimeout(r, 300))
      }
      export const down = async () => {}
    `)
    migration('002_count', `
      export const up = async (db) => { await db.run('INSERT INTO runs (n) VALUES (2)') }
      export const down = async () => {}
    `)

    const [a, b] = [await connect(), await connect()]
    const [ma, mb] = [await createMigrator(dir, a), await createMigrator(dir, b)]

    const results = await Promise.all([ma.migrate(), mb.migrate()])

    const ran = results.map(r => r.ran)
    assert.deepStrictEqual(ran.flat().sort(), ['001_slow', '002_count'], `each migration once: ${JSON.stringify(ran)}`)
    assert.ok(ran.some(r => r.length === 0), 'the second run found nothing left to do')
    assert.deepStrictEqual(a.all('SELECT n FROM runs ORDER BY n').map(r => r.n), [1, 2])
    assert.strictEqual(a.all('SELECT * FROM _migrations_lock').length, 0, 'released afterwards')
  })

  test('a held lock makes another run wait, then time out with advice', async () => {
    migration('001_x', 'export const up = async () => {}\nexport const down = async () => {}\n')
    const db = await connect()
    db.exec('CREATE TABLE _migrations_lock (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, acquired_at TEXT NOT NULL)')
    db.run("INSERT INTO _migrations_lock VALUES (1, 'crashed-host:123:abcd', '2026-11-24T00:00:00.000Z')")

    const started = Date.now()
    const migrator = await createMigrator(dir, db, { lockTimeout: 600 })
    await assert.rejects(migrator.migrate(), (err) => {
      assert.match(err.message, /holds the migration lock/)
      assert.match(err.message, /crashed-host:123:abcd/)
      assert.match(err.message, /migrate:unlock/)
      return true
    })
    assert.ok(Date.now() - started >= 500, 'it waited before giving up')

    const { cleared, holder } = await migrator.unlock()
    assert.strictEqual(cleared, true)
    assert.strictEqual(holder.owner, 'crashed-host:123:abcd')

    assert.deepStrictEqual((await migrator.migrate()).ran, ['001_x'])
  })

  test('a failed migration still releases the lock', async () => {
    migration('001_bad', 'export const up = async () => { throw new Error("no") }\nexport const down = async () => {}\n')
    const db = await connect()
    const migrator = await createMigrator(dir, db)
    await assert.rejects(migrator.migrate(), /Migration failed/)
    assert.strictEqual(db.all('SELECT * FROM _migrations_lock').length, 0)
  })

  test('fresh keeps the lock table it is holding', async () => {
    migration('001_t', `
      export const up = async (db) => { await db.exec('CREATE TABLE t (id INTEGER)') }
      export const down = async (db) => { await db.exec('DROP TABLE t') }
    `)
    const db = await connect()
    const migrator = await createMigrator(dir, db)
    await migrator.migrate()
    const { ran } = await migrator.fresh()
    assert.deepStrictEqual(ran, ['001_t'])
    assert.strictEqual(db.all('SELECT * FROM _migrations_lock').length, 0)
  })

  test('lock: false skips it', async () => {
    migration('001_x', 'export const up = async () => {}\nexport const down = async () => {}\n')
    const db = await connect()
    await (await createMigrator(dir, db, { lock: false })).migrate()
    assert.strictEqual(db.get("SELECT name FROM sqlite_master WHERE name = '_migrations_lock'"), undefined)
  })
})

describe('the migration lock (Postgres advisory lock)', () => {
  /** A pool whose clients share one advisory-lock table, as sessions do. */
  function fakePool() {
    const held = new Map()
    const log = []
    let session = 0
    return {
      log,
      connect: async () => {
        const id = ++session
        return {
          async query(sql, params) {
            log.push({ id, sql, params })
            if (sql.includes('pg_try_advisory_lock')) {
              const owner = held.get(params[0])
              if (owner === undefined || owner === id) { held.set(params[0], id); return { rows: [{ locked: true }] } }
              return { rows: [{ locked: false }] }
            }
            if (sql.includes('pg_advisory_unlock')) {
              if (held.get(params[0]) === id) held.delete(params[0])
              return { rows: [{ pg_advisory_unlock: true }] }
            }
            return { rows: [] }
          },
          release: (err) => log.push({ id, released: true, err })
        }
      }
    }
  }

  const pgAdapter = (pool) => ({ driver: 'postgres', raw: pool })

  test('serialises two runs on one key and releases the session', async () => {
    const pool = fakePool()
    const order = []
    const work = (name) => async () => {
      order.push(`${name}:start`)
      await new Promise(r => setTimeout(r, 300))
      order.push(`${name}:end`)
    }

    await Promise.all([
      withMigrationLock(pgAdapter(pool), 5000, work('a')),
      withMigrationLock(pgAdapter(pool), 5000, work('b'))
    ])

    assert.deepStrictEqual(order, ['a:start', 'a:end', 'b:start', 'b:end'])
    const tries = pool.log.filter(l => l.sql?.includes('pg_try_advisory_lock'))
    assert.ok(tries.every(l => l.params[0] === POSTGRES_LOCK_KEY))
    assert.strictEqual(pool.log.filter(l => l.released).length, 2)
    assert.strictEqual(pool.log.filter(l => l.sql?.includes('pg_advisory_unlock')).length, 2)
  })

  test('times out with a message naming the key', async () => {
    const pool = fakePool()
    let release
    const holding = withMigrationLock(pgAdapter(pool), 5000, () => new Promise(r => { release = r }))
    await new Promise(r => setTimeout(r, 20))

    await assert.rejects(withMigrationLock(pgAdapter(pool), 400, async () => {}), new RegExp(`advisory lock ${POSTGRES_LOCK_KEY}`))
    release()
    await holding
  })
})

describe('the migration lock on a real Postgres', { skip: !process.env.TEST_POSTGRES_URL && 'set TEST_POSTGRES_URL to run' }, () => {
  test('two concurrent migrate runs apply each migration once', async () => {
    const { createPostgresAdapter } = await import('./adapters/postgres.js')
    const a = await createPostgresAdapter(process.env.TEST_POSTGRES_URL)
    const b = await createPostgresAdapter(process.env.TEST_POSTGRES_URL)

    try {
      await a.exec('DROP TABLE IF EXISTS lock_runs, _migrations, _migrations_lock CASCADE')
      migration('001_slow', `
        export const up = async (db) => {
          await db.exec('CREATE TABLE lock_runs (n INTEGER)')
          await db.run('INSERT INTO lock_runs (n) VALUES (1)')
          await new Promise(r => setTimeout(r, 300))
        }
        export const down = async (db) => { await db.exec('DROP TABLE lock_runs') }
      `)
      migration('002_concurrently', `
        export const transaction = false
        export const up = async (db) => { await db.exec('CREATE INDEX CONCURRENTLY IF NOT EXISTS lock_runs_n ON lock_runs (n)') }
        export const down = async (db) => { await db.exec('DROP INDEX CONCURRENTLY IF EXISTS lock_runs_n') }
      `)

      const results = await Promise.all([
        createMigrator(dir, a).then(m => m.migrate()),
        createMigrator(dir, b).then(m => m.migrate())
      ])

      assert.deepStrictEqual(results.map(r => r.ran).flat().sort(), ['001_slow', '002_concurrently'])
      assert.deepStrictEqual((await a.all('SELECT n FROM lock_runs')).map(r => r.n), [1])
      assert.ok(await a.get("SELECT 1 AS ok FROM pg_indexes WHERE indexname = 'lock_runs_n'"))
      assert.strictEqual(await a.get('SELECT 1 FROM information_schema.tables WHERE table_name = $1', ['_migrations_lock']), undefined,
        'Postgres needs no lock table')

      const { rolledBack } = await (await createMigrator(dir, a)).rollback()
      assert.deepStrictEqual(rolledBack, ['002_concurrently', '001_slow'])
    } finally {
      await a.exec('DROP TABLE IF EXISTS lock_runs, _migrations CASCADE').catch(() => {})
      await a.close()
      await b.close()
    }
  })
})
