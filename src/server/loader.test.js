/**
 * loadConfig: no file means defaults, and a file that fails to load is an
 * error, not a silent `{}`.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from './loader.js'

let dir
let cwd

beforeEach(() => {
  cwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), 'basicben-config-'))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  test('no config file gives the defaults', async () => {
    assert.deepStrictEqual(await loadConfig(), {})
  })

  test('returns the default export', async () => {
    writeFileSync(join(dir, 'basicben.config.js'), 'export default { port: 4321 }')
    assert.deepStrictEqual(await loadConfig(), { port: 4321 })
  })

  test('reads basicben.config.mjs too', async () => {
    writeFileSync(join(dir, 'basicben.config.mjs'), 'export default { port: 4322 }')
    assert.deepStrictEqual(await loadConfig(), { port: 4322 })
  })

  test('awaits a default export that is a promise', async () => {
    writeFileSync(join(dir, 'basicben.config.js'), 'export default Promise.resolve({ port: 4323 })')
    assert.deepStrictEqual(await loadConfig(), { port: 4323 })
  })

  test('a syntax error is thrown, naming the file', async () => {
    writeFileSync(join(dir, 'basicben.config.js'), 'export default { cors: { origin: [ }')
    await assert.rejects(loadConfig(), /Could not load basicben\.config\.js/)
  })

  test('an import the config cannot resolve is thrown, not replaced by defaults', async () => {
    writeFileSync(join(dir, 'basicben.config.js'), "import { defineSite } from '@nobody/missing'\nexport default defineSite({})")
    await assert.rejects(loadConfig(), (err) => {
      assert.match(err.message, /Could not load basicben\.config\.js/)
      assert.match(err.message, /@nobody\/missing/)
      return true
    })
  })

  test('a config that throws while loading is thrown', async () => {
    writeFileSync(join(dir, 'basicben.config.js'), "throw new Error('S3_BUCKET is required')")
    await assert.rejects(loadConfig(), /S3_BUCKET is required/)
  })
})
