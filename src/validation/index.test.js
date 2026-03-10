/**
 * Tests for the validation system
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { validate, rules, rule } from './index.js'

describe('validate', () => {
  test('passes with valid data', async () => {
    const result = await validate(
      { email: 'test@example.com' },
      { email: [rules.required, rules.email] }
    )

    assert.ok(result.passes())
    assert.ok(!result.fails())
  })

  test('fails with invalid data', async () => {
    const result = await validate(
      { email: 'not-an-email' },
      { email: [rules.required, rules.email] }
    )

    assert.ok(result.fails())
    assert.ok(!result.passes())
  })

  test('returns errors object', async () => {
    const result = await validate(
      { email: '' },
      { email: [rules.required] }
    )

    assert.ok(result.errors.email)
    assert.strictEqual(result.errors.email[0], 'email is required')
  })

  test('first() returns first error', async () => {
    const result = await validate(
      { email: '' },
      { email: [rules.required, rules.email] }
    )

    assert.strictEqual(result.first('email'), 'email is required')
  })

  test('all() returns flat array', async () => {
    const result = await validate(
      { email: '', name: '' },
      {
        email: [rules.required],
        name: [rules.required]
      }
    )

    const all = result.all()
    assert.strictEqual(all.length, 2)
    assert.ok(all.some(e => e.field === 'email'))
    assert.ok(all.some(e => e.field === 'name'))
  })
})

describe('rules.required', () => {
  test('fails on empty string', async () => {
    const result = await validate({ name: '' }, { name: [rules.required] })
    assert.ok(result.fails())
  })

  test('fails on null', async () => {
    const result = await validate({ name: null }, { name: [rules.required] })
    assert.ok(result.fails())
  })

  test('fails on undefined', async () => {
    const result = await validate({}, { name: [rules.required] })
    assert.ok(result.fails())
  })

  test('passes on valid value', async () => {
    const result = await validate({ name: 'Alice' }, { name: [rules.required] })
    assert.ok(result.passes())
  })
})

describe('rules.optional', () => {
  test('skips validation on empty value', async () => {
    const result = await validate(
      { email: '' },
      { email: [rules.optional, rules.email] }
    )
    assert.ok(result.passes())
  })

  test('validates when value present', async () => {
    const result = await validate(
      { email: 'invalid' },
      { email: [rules.optional, rules.email] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.email', () => {
  test('passes valid email', async () => {
    const result = await validate(
      { email: 'test@example.com' },
      { email: [rules.email] }
    )
    assert.ok(result.passes())
  })

  test('fails invalid email', async () => {
    const result = await validate(
      { email: 'not-valid' },
      { email: [rules.email] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.min', () => {
  test('fails string shorter than min', async () => {
    const result = await validate(
      { password: '123' },
      { password: [rules.min(8)] }
    )
    assert.ok(result.fails())
    assert.ok(result.first('password').includes('at least 8'))
  })

  test('passes string at min length', async () => {
    const result = await validate(
      { password: '12345678' },
      { password: [rules.min(8)] }
    )
    assert.ok(result.passes())
  })

  test('fails number below min', async () => {
    const result = await validate(
      { age: 5 },
      { age: [rules.min(18)] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.max', () => {
  test('fails string longer than max', async () => {
    const result = await validate(
      { name: 'a'.repeat(101) },
      { name: [rules.max(100)] }
    )
    assert.ok(result.fails())
  })

  test('passes string at max length', async () => {
    const result = await validate(
      { name: 'a'.repeat(100) },
      { name: [rules.max(100)] }
    )
    assert.ok(result.passes())
  })
})

describe('rules.between', () => {
  test('passes value in range', async () => {
    const result = await validate(
      { age: 25 },
      { age: [rules.between(18, 100)] }
    )
    assert.ok(result.passes())
  })

  test('fails value below range', async () => {
    const result = await validate(
      { age: 10 },
      { age: [rules.between(18, 100)] }
    )
    assert.ok(result.fails())
  })

  test('fails value above range', async () => {
    const result = await validate(
      { age: 150 },
      { age: [rules.between(18, 100)] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.in', () => {
  test('passes when value in list', async () => {
    const result = await validate(
      { role: 'admin' },
      { role: [rules.in('admin', 'user', 'guest')] }
    )
    assert.ok(result.passes())
  })

  test('fails when value not in list', async () => {
    const result = await validate(
      { role: 'superuser' },
      { role: [rules.in('admin', 'user', 'guest')] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.confirmed', () => {
  test('passes when fields match', async () => {
    const result = await validate(
      { password: 'secret123', password_confirmation: 'secret123' },
      { password: [rules.confirmed()] }
    )
    assert.ok(result.passes())
  })

  test('fails when fields do not match', async () => {
    const result = await validate(
      { password: 'secret123', password_confirmation: 'different' },
      { password: [rules.confirmed()] }
    )
    assert.ok(result.fails())
  })
})

describe('rules.regex', () => {
  test('passes when pattern matches', async () => {
    const result = await validate(
      { code: 'ABC123' },
      { code: [rules.regex(/^[A-Z]{3}\d{3}$/)] }
    )
    assert.ok(result.passes())
  })

  test('fails when pattern does not match', async () => {
    const result = await validate(
      { code: 'abc123' },
      { code: [rules.regex(/^[A-Z]{3}\d{3}$/)] }
    )
    assert.ok(result.fails())
  })
})

describe('custom rules', () => {
  test('async custom rule works', async () => {
    const asyncRule = async (value) => {
      // Simulate async check
      await new Promise(r => setTimeout(r, 1))
      if (value === 'taken') {
        return 'This value is already taken'
      }
      return null
    }

    const result = await validate(
      { username: 'taken' },
      { username: [asyncRule] }
    )

    assert.ok(result.fails())
    assert.strictEqual(result.first('username'), 'This value is already taken')
  })

  test('rule() helper creates custom rule', async () => {
    const isPositive = rule(
      (value) => value > 0,
      'Value must be positive'
    )

    const result = await validate(
      { amount: -5 },
      { amount: [isPositive] }
    )

    assert.ok(result.fails())
    assert.strictEqual(result.first('amount'), 'Value must be positive')
  })
})
