/**
 * Tests for Turso adapter
 * Skipped if @libsql/client is not installed or TURSO_URL is not set
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'

let createTursoAdapter
let skipTests = false
let skipReason = ''

// Check if @libsql/client is available and configured
try {
  const module = await import('./turso.js')
  createTursoAdapter = module.createTursoAdapter

  // Check for required environment variables
  if (!process.env.TURSO_URL) {
    skipTests = true
    skipReason = 'TURSO_URL environment variable not set'
  }
} catch (err) {
  skipTests = true
  skipReason = '@libsql/client not installed'
}

describe('Turso Adapter', { skip: skipTests }, () => {
  let db

  test('connects to Turso database', async () => {
    db = await createTursoAdapter(process.env.TURSO_URL, {
      authToken: process.env.TURSO_AUTH_TOKEN
    })

    assert.ok(db)
    assert.strictEqual(db.driver, 'turso')
  })

  test('creates table', async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS turso_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `)
  })

  test('run() inserts and returns lastInsertRowid', async () => {
    const result = await db.run(
      'INSERT INTO turso_test (name) VALUES (?)',
      ['Alice']
    )

    assert.ok(result.lastInsertRowid > 0)
    assert.strictEqual(result.changes, 1)
  })

  test('get() returns single row', async () => {
    const row = await db.get('SELECT * FROM turso_test WHERE name = ?', ['Alice'])

    assert.ok(row)
    assert.strictEqual(row.name, 'Alice')
  })

  test('all() returns array of rows', async () => {
    await db.run('INSERT INTO turso_test (name) VALUES (?)', ['Bob'])

    const rows = await db.all('SELECT * FROM turso_test ORDER BY name')

    assert.ok(Array.isArray(rows))
    assert.strictEqual(rows.length, 2)
  })

  test('cleanup', async () => {
    await db.exec('DROP TABLE IF EXISTS turso_test')
    await db.close()
  })
})

// If tests are skipped, add a note
if (skipTests) {
  test(`Turso tests skipped (${skipReason})`, { skip: true }, () => {})
}
