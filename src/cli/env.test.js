/**
 * Tests for .env loading
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from './env.js'

describe('loadEnv', () => {
  const withEnvFile = (contents, fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-env-'))
    writeFileSync(join(dir, '.env'), contents)
    try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  test('strips quotes the way --env-file does', () => {
    withEnvFile('BB_T_DQ="double quoted"\nBB_T_SQ=\'single\'\nBB_T_PLAIN=plain # comment\n', (dir) => {
      try {
        loadEnv(dir)
        assert.strictEqual(process.env.BB_T_DQ, 'double quoted')
        assert.strictEqual(process.env.BB_T_SQ, 'single')
        assert.strictEqual(process.env.BB_T_PLAIN, 'plain')
      } finally {
        delete process.env.BB_T_DQ
        delete process.env.BB_T_SQ
        delete process.env.BB_T_PLAIN
      }
    })
  })

  test('a value already in the environment wins', () => {
    withEnvFile('BB_T_KEEP=from-file\n', (dir) => {
      process.env.BB_T_KEEP = 'from-env'
      try {
        loadEnv(dir)
        assert.strictEqual(process.env.BB_T_KEEP, 'from-env')
      } finally {
        delete process.env.BB_T_KEEP
      }
    })
  })

  test('no .env is not an error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-env-'))
    try {
      assert.strictEqual(loadEnv(dir), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
