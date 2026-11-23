/**
 * Tests for Postgres adapter configuration.
 *
 * These cover the pool settings only, which needs no server — connecting is
 * what the adapter's other paths do, and there is no Postgres in CI.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { poolOptions } from './postgres.js'

const URL = 'postgres://user@localhost:5432/app'

describe('Postgres pool options', () => {
  test('lets the process exit once clients are idle', () => {
    // Without this, a pool with one idle client holds the event loop open for
    // the whole idle timeout, so every CLI command appears to hang for 30
    // seconds after it has already finished and committed its work.
    assert.strictEqual(poolOptions(URL).allowExitOnIdle, true)
  })

  test('a project can opt back in to holding the loop open', () => {
    assert.strictEqual(poolOptions(URL, { allowExitOnIdle: false }).allowExitOnIdle, false)
  })

  test('defaults', () => {
    const options = poolOptions(URL)

    assert.strictEqual(options.connectionString, URL)
    assert.strictEqual(options.max, 10)
    assert.strictEqual(options.idleTimeoutMillis, 30000)
    assert.strictEqual(options.connectionTimeoutMillis, 2000)
  })

  test('config overrides the defaults', () => {
    const options = poolOptions(URL, {
      poolSize: 25,
      idleTimeout: 1000,
      connectionTimeout: 500
    })

    assert.strictEqual(options.max, 25)
    assert.strictEqual(options.idleTimeoutMillis, 1000)
    assert.strictEqual(options.connectionTimeoutMillis, 500)
  })
})

describe('int8 parsing', async () => {
  const { parseInt8, pgTypes } = await import('./postgres.js')

  test('a safe int8 becomes a number', () => {
    assert.strictEqual(parseInt8('42'), 42)
    assert.strictEqual(parseInt8('-7'), -7)
  })

  test('an unsafe one stays a string rather than losing precision', () => {
    assert.strictEqual(parseInt8('9223372036854775807'), '9223372036854775807')
  })

  test('only int8 is replaced; numeric and the rest are pg\'s own', () => {
    const base = { getTypeParser: (oid) => `base-${oid}` }
    const types = pgTypes(base)

    assert.strictEqual(types.getTypeParser(20), parseInt8)
    assert.strictEqual(types.getTypeParser(1700), 'base-1700')
    assert.strictEqual(types.getTypeParser(20, 'binary'), 'base-20')
  })
})

describe('Postgres transactions', async () => {
  const { runTransaction } = await import('./postgres.js')

  const fakePool = ({ failOn = [] } = {}) => {
    const log = []
    const client = {
      released: undefined,
      async query(sql) {
        log.push(sql)
        if (failOn.some((pattern) => sql.startsWith(pattern))) throw new Error(`${sql} failed`)
        return { rows: [], rowCount: 0 }
      },
      release(err) { client.released = err ?? null }
    }
    return { log, client, pool: { connect: async () => client } }
  }

  test('a failed ROLLBACK does not mask the original error, and the client is destroyed', async () => {
    const { client, pool } = fakePool({ failOn: ['ROLLBACK'] })

    await assert.rejects(runTransaction(pool, async () => { throw new Error('original') }), /original/)
    assert.match(client.released?.message ?? '', /ROLLBACK failed/, 'released with the rollback error')
  })

  test('a clean rollback releases the client normally', async () => {
    const { client, pool } = fakePool()
    await assert.rejects(runTransaction(pool, async () => { throw new Error('x') }))
    assert.strictEqual(client.released, null)
  })

  test('nested transactions are savepoints', async () => {
    const { log, pool } = fakePool()

    await runTransaction(pool, async (tx) => {
      await tx.run('INSERT 1')
      await assert.rejects(tx.transaction(async (inner) => {
        await inner.run('INSERT 2')
        throw new Error('inner')
      }))
      await tx.transaction(async (inner) => inner.run('INSERT 3'))
    })

    assert.deepStrictEqual(log, [
      'BEGIN', 'INSERT 1',
      'SAVEPOINT bb_savepoint_1', 'INSERT 2', 'ROLLBACK TO SAVEPOINT bb_savepoint_1', 'RELEASE SAVEPOINT bb_savepoint_1',
      'SAVEPOINT bb_savepoint_1', 'INSERT 3', 'RELEASE SAVEPOINT bb_savepoint_1',
      'COMMIT'
    ])
  })
})
