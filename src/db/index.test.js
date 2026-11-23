/**
 * Tests for the default connection loader
 */

import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert'
import { getDb, resetDb, db } from './index.js'

describe('getDb', () => {
  const saved = process.env.DATABASE_URL

  afterEach(async () => {
    await db.close()
    resetDb()
    if (saved === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = saved
  })

  test('concurrent first calls share one connection', async () => {
    // Caching the adapter rather than the promise let every caller arriving
    // during the first connect open — and leak — a connection of its own.
    process.env.DATABASE_URL = ':memory:'
    resetDb()

    const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()])

    assert.strictEqual(a, b)
    assert.strictEqual(b, c)
  })

  test('a failed connect is not cached', async () => {
    process.env.DATABASE_URL = '/nonexistent-dir-for-basicben-test/x.sqlite'
    resetDb()

    await assert.rejects(getDb())

    process.env.DATABASE_URL = ':memory:'
    const conn = await getDb()
    assert.strictEqual(conn.driver, 'sqlite')
  })
})
