/**
 * Tests for `basicben test` argument building
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { testArgs, DEFAULT_PATTERNS } from './test.js'

describe('basicben test', () => {
  test('runs node --test over the default patterns', () => {
    const { argv } = testArgs([], {})
    assert.deepStrictEqual(argv, ['--test', ...DEFAULT_PATTERNS])
    assert.ok(DEFAULT_PATTERNS.includes('tests/**/*.test.ts'), 'TypeScript tests are included')
  })

  test('positional files replace the defaults', () => {
    assert.deepStrictEqual(testArgs(['tests/a.test.js'], {}).argv, ['--test', 'tests/a.test.js'])
  })

  test('maps watch and coverage to Node flags', () => {
    const { argv } = testArgs([], { w: true, coverage: true })
    assert.ok(argv.includes('--watch'))
    assert.ok(argv.includes('--experimental-test-coverage'))
  })

  test('passes other flags through', () => {
    const { argv } = testArgs([], { 'test-name-pattern': 'login', only: true })
    assert.ok(argv.includes('--test-name-pattern=login'))
    assert.ok(argv.includes('--only'))
  })

  test('--ui is ignored with a warning', () => {
    const { argv, warnings } = testArgs([], { ui: true })
    assert.ok(!argv.some((a) => a.includes('ui')))
    assert.strictEqual(warnings.length, 1)
  })
})
