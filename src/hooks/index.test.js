import { test, describe } from 'node:test'
import assert from 'node:assert'
import { HookManager } from './index.js'

describe('hooks.filter strict mode', () => {
  const quiet = () => {
    const original = console.error
    console.error = () => {}
    return () => { console.error = original }
  }

  test('by default a throwing listener is logged and skipped', async () => {
    const restore = quiet()
    const hooks = new HookManager()
    hooks.on('x', () => { throw new Error('boom') })
    hooks.on('x', (v) => v + 1)
    try {
      assert.strictEqual(await hooks.filter('x', 1), 2)
    } finally { restore() }
  })

  test('strict rethrows, so a guard that fails refuses the write', async () => {
    const hooks = new HookManager()
    hooks.on('x', () => { throw new Error('refused') })
    await assert.rejects(hooks.filter('x', 1, {}, { strict: true }), /refused/)
  })

  test('strict stops at the throwing listener', async () => {
    const hooks = new HookManager()
    let after = false
    hooks.on('x', () => { throw new Error('stop') })
    hooks.on('x', () => { after = true })
    await assert.rejects(hooks.filter('x', 1, {}, { strict: true }))
    assert.strictEqual(after, false)
  })

  test('strict changes nothing when listeners succeed', async () => {
    const hooks = new HookManager()
    hooks.on('x', (v) => v * 2)
    assert.strictEqual(await hooks.filter('x', 3, {}, { strict: true }), 6)
  })
})
