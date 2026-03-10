/**
 * Tests for PlanetScale adapter
 * Skipped if @planetscale/database is not installed or DATABASE_URL is not set
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'

let createPlanetScaleAdapter
let skipTests = false
let skipReason = ''

// Check if @planetscale/database is available and configured
try {
  const module = await import('./planetscale.js')
  createPlanetScaleAdapter = module.createPlanetScaleAdapter

  // Check for required environment variables
  if (!process.env.PLANETSCALE_URL && !process.env.PLANETSCALE_HOST) {
    skipTests = true
    skipReason = 'PLANETSCALE_URL or PLANETSCALE_HOST environment variable not set'
  }
} catch (err) {
  skipTests = true
  skipReason = '@planetscale/database not installed'
}

describe('PlanetScale Adapter', { skip: skipTests }, () => {
  let db

  test('connects to PlanetScale database', async () => {
    db = await createPlanetScaleAdapter(process.env.PLANETSCALE_URL)

    assert.ok(db)
    assert.strictEqual(db.driver, 'planetscale')
  })

  test('creates table', async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS planetscale_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `)
  })

  test('run() inserts and returns insertId', async () => {
    const result = await db.run(
      'INSERT INTO planetscale_test (name) VALUES (?)',
      ['Alice']
    )

    assert.ok(result.lastInsertRowid > 0)
    assert.strictEqual(result.changes, 1)
  })

  test('get() returns single row', async () => {
    const row = await db.get('SELECT * FROM planetscale_test WHERE name = ?', ['Alice'])

    assert.ok(row)
    assert.strictEqual(row.name, 'Alice')
  })

  test('all() returns array of rows', async () => {
    await db.run('INSERT INTO planetscale_test (name) VALUES (?)', ['Bob'])

    const rows = await db.all('SELECT * FROM planetscale_test ORDER BY name')

    assert.ok(Array.isArray(rows))
    assert.strictEqual(rows.length, 2)
  })

  test('cleanup', async () => {
    await db.exec('DROP TABLE IF EXISTS planetscale_test')
    await db.close()
  })
})

// If tests are skipped, add a note
if (skipTests) {
  test(`PlanetScale tests skipped (${skipReason})`, { skip: true }, () => {})
}
