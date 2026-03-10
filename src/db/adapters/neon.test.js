/**
 * Tests for Neon adapter
 * Skipped if @neondatabase/serverless is not installed or NEON_URL is not set
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'

let createNeonAdapter
let skipTests = false
let skipReason = ''

// Check if @neondatabase/serverless is available and configured
try {
  const module = await import('./neon.js')
  createNeonAdapter = module.createNeonAdapter

  // Check for required environment variables
  if (!process.env.NEON_URL) {
    skipTests = true
    skipReason = 'NEON_URL environment variable not set'
  }
} catch (err) {
  skipTests = true
  skipReason = '@neondatabase/serverless not installed'
}

describe('Neon Adapter', { skip: skipTests }, () => {
  let db

  test('connects to Neon database', async () => {
    db = await createNeonAdapter(process.env.NEON_URL)

    assert.ok(db)
    assert.strictEqual(db.driver, 'neon')
  })

  test('creates table', async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS neon_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
  })

  test('run() inserts and returns affected rows', async () => {
    const result = await db.run(
      'INSERT INTO neon_test (name) VALUES ($1)',
      ['Alice']
    )

    assert.strictEqual(result.changes, 1)
  })

  test('get() returns single row', async () => {
    const row = await db.get('SELECT * FROM neon_test WHERE name = $1', ['Alice'])

    assert.ok(row)
    assert.strictEqual(row.name, 'Alice')
  })

  test('all() returns array of rows', async () => {
    await db.run('INSERT INTO neon_test (name) VALUES ($1)', ['Bob'])

    const rows = await db.all('SELECT * FROM neon_test ORDER BY name')

    assert.ok(Array.isArray(rows))
    assert.strictEqual(rows.length, 2)
  })

  test('cleanup', async () => {
    await db.exec('DROP TABLE IF EXISTS neon_test')
    await db.close()
  })
})

// If tests are skipped, add a note
if (skipTests) {
  test(`Neon tests skipped (${skipReason})`, { skip: true }, () => {})
}
