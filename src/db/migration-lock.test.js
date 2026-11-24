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

describe('the migration lock on a real Postgres (advisory)', { skip: !process.env.TEST_POSTGRES_URL && 'set TEST_POSTGRES_URL to run' }, () => {
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

describe('choosing the lock', () => {
  /** A Postgres-flavoured adapter whose lock-row SQL works in memory. */
  function pgLike(poolOptions, { failCreate = 0, failDelete = false } = {}) {
    let row = null
    const log = []
    let connects = 0
    return {
      log,
      get connects() { return connects },
      driver: 'postgres',
      raw: { options: poolOptions, connect: async () => { connects++; return { query: async () => ({ rows: [{ locked: true }] }), release() {} } } },
      async exec(sql) {
        log.push(sql)
        if (sql.includes('CREATE TABLE') && failCreate-- > 0) {
          throw new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"')
        }
      },
      async run(sql, params) {
        log.push(sql)
        if (sql.startsWith('INSERT INTO "_migrations_lock"')) {
          if (row) return { changes: 0 }
          row = { owner: params[0], acquired_at: params[1] }
          return { changes: 1 }
        }
        if (sql.startsWith('DELETE FROM "_migrations_lock"')) {
          if (failDelete) throw new Error('connection reset')
          row = null
          return { changes: 1 }
        }
        return { changes: 0 }
      },
      async get() { return row ?? undefined },
      async all() { return [] }
    }
  }

  const usedRow = (db) => db.log.some(sql => sql.startsWith('INSERT INTO "_migrations_lock"'))

  test('a pool of one falls back to the lock row instead of deadlocking', async () => {
    const db = pgLike({ max: 1, connectionString: 'postgres://u@db.example/app' })
    await withMigrationLock(db, 1000, async () => {})
    assert.strictEqual(db.connects, 0, 'no client held for an advisory lock')
    assert.ok(usedRow(db))
  })

  test('a transaction-mode pooler falls back to the lock row', async () => {
    for (const connectionString of ['postgres://u@ep-cool-1-pooler.us-east-2.aws.neon.tech/app', 'postgres://u@pgbouncer.internal:6432/app']) {
      const db = pgLike({ max: 10, connectionString })
      await withMigrationLock(db, 1000, async () => {})
      assert.strictEqual(db.connects, 0, connectionString)
      assert.ok(usedRow(db), connectionString)
    }
  })

  test('an ordinary pool uses the advisory lock; the mode can be forced either way', async () => {
    const plain = pgLike({ max: 10, connectionString: 'postgres://u@db.example/app' })
    await withMigrationLock(plain, 1000, async () => {})
    assert.strictEqual(plain.connects, 1)
    assert.ok(!usedRow(plain))

    const forcedTable = pgLike({ max: 10, connectionString: 'postgres://u@db.example/app' })
    await withMigrationLock(forcedTable, 1000, 'table', async () => {})
    assert.ok(usedRow(forcedTable))

    const forcedAdvisory = pgLike({ max: 10, connectionString: 'postgres://u@x-pooler.neon.tech/app' })
    await withMigrationLock(forcedAdvisory, 1000, 'advisory', async () => {})
    assert.strictEqual(forcedAdvisory.connects, 1)
  })

  test('createMigrator refuses an unknown lock mode', async () => {
    await assert.rejects(createMigrator(dir, pgLike({}), { lock: 'sometimes' }), /migrationLock must be/)
  })

  test('two runs racing to create the lock table do not fail', async () => {
    const db = pgLike({ max: 1 }, { failCreate: 2 })
    assert.strictEqual(await withMigrationLock(db, 1000, async () => 'done'), 'done')
    assert.strictEqual(db.log.filter(sql => sql.includes('CREATE TABLE')).length, 3)
  })

  test('a failed release does not hide the migration error', async () => {
    const db = pgLike({ max: 1 }, { failDelete: true })
    await assert.rejects(
      withMigrationLock(db, 1000, async () => { throw new Error('Migration failed: 001_bad') }),
      (err) => /Migration failed: 001_bad/.test(err.message) && /migrate:unlock/.test(err.message)
    )
  })

  test('a failed release after a successful run says so', async () => {
    const db = pgLike({ max: 1 }, { failDelete: true })
    await assert.rejects(withMigrationLock(db, 1000, async () => {}), /Migrations finished\. The migration lock could not be released/)
  })
})

describe('the migration lock on a real Postgres (lock row)', { skip: !process.env.TEST_POSTGRES_URL && 'set TEST_POSTGRES_URL to run' }, () => {
  test('pools of one fall back to the row, and two runs still apply each migration once', async () => {
    const { createPostgresAdapter } = await import('./adapters/postgres.js')
    const a = await createPostgresAdapter(process.env.TEST_POSTGRES_URL, { poolSize: 1 })
    const b = await createPostgresAdapter(process.env.TEST_POSTGRES_URL, { poolSize: 1 })

    try {
      await a.exec('DROP TABLE IF EXISTS lock_rows, _migrations, _migrations_lock CASCADE')
      migration('001_slow', `
        export const up = async (db) => {
          await db.exec('CREATE TABLE lock_rows (n INTEGER)')
          await db.run('INSERT INTO lock_rows (n) VALUES (1)')
          await new Promise(r => setTimeout(r, 300))
        }
        export const down = async (db) => { await db.exec('DROP TABLE lock_rows') }
      `)

      const results = await Promise.all([
        createMigrator(dir, a, { lockTimeout: 10_000 }).then(m => m.migrate()),
        createMigrator(dir, b, { lockTimeout: 10_000 }).then(m => m.migrate())
      ])

      assert.deepStrictEqual(results.map(r => r.ran).flat(), ['001_slow'])
      assert.deepStrictEqual((await a.all('SELECT n FROM lock_rows')).map(r => r.n), [1])
      assert.deepStrictEqual(await a.all('SELECT * FROM _migrations_lock'), [], 'released')
    } finally {
      await a.exec('DROP TABLE IF EXISTS lock_rows, _migrations, _migrations_lock CASCADE').catch(() => {})
      await a.close()
      await b.close()
    }
  })
})
