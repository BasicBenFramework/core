/**
 * A second copy of the framework from another location refuses to load; the
 * same files loaded again do not.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { claimCopy } from './one-copy.js'

const A = 'file:///app/node_modules/@basicbenframework/core/src/one-copy.js'
const B = 'file:///app/node_modules/some-package/node_modules/@basicbenframework/core/src/one-copy.js'

describe('claimCopy', () => {
  test('the first copy is recorded', () => {
    const scope = {}
    claimCopy(A, '0.8.0', scope)
    assert.deepStrictEqual(scope[Symbol.for('basicben.core')], {
      version: '0.8.0',
      at: '/app/node_modules/@basicbenframework/core/src'
    })
  })

  test('a copy from another location is refused, naming both', () => {
    const scope = {}
    claimCopy(A, '0.8.0', scope)
    assert.throws(() => claimCopy(B, '0.7.0', scope), (err) => {
      assert.match(err.message, /Two copies of @basicbenframework\/core are loaded/)
      assert.match(err.message, /0\.8\.0 at \/app\/node_modules\/@basicbenframework\/core\/src/)
      assert.match(err.message, /0\.7\.0 at \/app\/node_modules\/some-package\//)
      return true
    })
  })

  test('the same files loaded again are allowed, query string or not', () => {
    const scope = {}
    claimCopy(A, '0.8.0', scope)
    assert.doesNotThrow(() => claimCopy(A, '0.8.0', scope))
    assert.doesNotThrow(() => claimCopy(`${A}?t=123`, '0.8.0', scope))
  })

  test('this process loaded one copy', async () => {
    // Importing through the package name and through a relative path reaches
    // the same files, so neither throws.
    await import('./hooks/index.js')
    await import('./db/index.js')
    const record = globalThis[Symbol.for('basicben.core')]
    assert.ok(record.at.endsWith('/src'))
  })

  test('runs in a browser: no node: imports, and http URLs work', () => {
    // The admin bundles the hook registry, and with it this file. 0.8.0
    // imported node:url here and every admin threw on load.
    const source = readFileSync(new URL('./one-copy.js', import.meta.url), 'utf-8')
    assert.doesNotMatch(source, /from ['"]node:/)
    const scope = {}
    claimCopy('https://cms.example.com/assets/index-abc.js', '0.8.1', scope)
    assert.strictEqual(scope[Symbol.for('basicben.core')].at, '/assets')
  })
})
