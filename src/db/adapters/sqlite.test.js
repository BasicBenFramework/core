/**
 * Tests for SQLite adapter
 * Skipped if better-sqlite3 is not installed
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import { unlinkSync, existsSync } from 'node:fs'

const TEST_DB = './test-sqlite.db'

// Check if better-sqlite3 is available
let createSqliteAdapter
let skipTests = false

try {
  const module = await import('./sqlite.js')
  createSqliteAdapter = module.createSqliteAdapter

  // Quick test to see if better-sqlite3 works
  await import('better-sqlite3')
} catch {
  skipTests = true
}

describe('SQLite Adapter', { skip: skipTests }, () => {
  let db

  before(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB)
    }

    db = await createSqliteAdapter(TEST_DB)

    // Create test table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `)
  })

  after(() => {
    if (db) db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    if (existsSync(TEST_DB + '-wal')) unlinkSync(TEST_DB + '-wal')
    if (existsSync(TEST_DB + '-shm')) unlinkSync(TEST_DB + '-shm')
  })

  test('run() inserts and returns lastInsertRowid', () => {
    const result = db.run(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      ['Alice', 'alice@test.com']
    )

    assert.strictEqual(result.lastInsertRowid, 1)
    assert.strictEqual(result.changes, 1)
  })

  test('get() returns single row', () => {
    const user = db.get('SELECT * FROM users WHERE id = ?', [1])

    assert.strictEqual(user.name, 'Alice')
    assert.strictEqual(user.email, 'alice@test.com')
  })

  test('get() returns undefined for no match', () => {
    const user = db.get('SELECT * FROM users WHERE id = ?', [999])

    assert.strictEqual(user, undefined)
  })

  test('all() returns array of rows', () => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@test.com'])

    const users = db.all('SELECT * FROM users ORDER BY id')

    assert.strictEqual(users.length, 2)
    assert.strictEqual(users[0].name, 'Alice')
    assert.strictEqual(users[1].name, 'Bob')
  })

  test('run() updates rows', () => {
    const result = db.run(
      'UPDATE users SET name = ? WHERE id = ?',
      ['Alice Updated', 1]
    )

    assert.strictEqual(result.changes, 1)

    const user = db.get('SELECT * FROM users WHERE id = ?', [1])
    assert.strictEqual(user.name, 'Alice Updated')
  })

  test('run() deletes rows', () => {
    const result = db.run('DELETE FROM users WHERE id = ?', [2])

    assert.strictEqual(result.changes, 1)

    const users = db.all('SELECT * FROM users')
    assert.strictEqual(users.length, 1)
  })

  test('transaction() commits on success', () => {
    db.transaction(() => {
      db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Charlie', 'charlie@test.com'])
      db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Diana', 'diana@test.com'])
    })

    const users = db.all('SELECT * FROM users')
    assert.strictEqual(users.length, 3)
  })

  test('transaction() rolls back on error', () => {
    const countBefore = db.all('SELECT * FROM users').length

    try {
      db.transaction(() => {
        db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['Eve', 'eve@test.com'])
        throw new Error('Simulated error')
      })
    } catch {
      // Expected
    }

    const countAfter = db.all('SELECT * FROM users').length
    assert.strictEqual(countAfter, countBefore)
  })
})

// If tests are skipped, add a note
if (skipTests) {
  test('SQLite tests skipped (better-sqlite3 not installed)', { skip: true }, () => {})
}
