/**
 * QueryBuilder behaviour added or changed in 0.9.0: strict mass assignment,
 * null comparisons, IN, OR, joins and LIKE.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import { QueryBuilder, escapeLike } from './QueryBuilder.js'
import { createSqliteAdapter } from './adapters/sqlite.js'

function recordingDb() {
  const calls = []
  const record = (sql, params) => { calls.push({ sql, params }); return { changes: 0, lastInsertRowid: null } }
  return { calls, run: record, get: record, all: (sql, params) => { record(sql, params); return [] } }
}

let db

before(async () => {
  db = await createSqliteAdapter(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, is_admin INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER, title TEXT, status TEXT);
    INSERT INTO users (name, email) VALUES ('Ada', 'ada@x.test'), ('Grace', 'grace@x.test'), ('Linus', NULL);
    UPDATE users SET deleted_at = '2026-01-01' WHERE name = 'Linus';
    INSERT INTO posts (author_id, title, status) VALUES (1, 'Hello World', 'published'), (1, 'Draft_1', 'draft'), (2, '100% Done', 'published'), (9, 'Orphan', 'published');
  `)
})

after(() => db?.close())

const users = () => new QueryBuilder(db, 'users')
const posts = () => new QueryBuilder(db, 'posts')

describe('strict mass assignment', () => {
  test('insert() without only() or unguarded() is refused', async () => {
    await assert.rejects(() => users().insert({ name: 'Eve', is_admin: 1 }), (err) => {
      assert.strictEqual(err.code, 'MASS_ASSIGNMENT')
      assert.match(err.message, /insert\(\) on "users"/)
      assert.match(err.message, /\.only\(/)
      assert.match(err.message, /\.unguarded\(\)/)
      return true
    })
  })

  test('update() without only() or unguarded() is refused and writes nothing', async () => {
    await assert.rejects(() => users().where('id', 1).update({ is_admin: 1 }), { code: 'MASS_ASSIGNMENT' })
    assert.strictEqual((await users().find(1)).is_admin, 0)
  })

  test('except() alone does not permit a write', async () => {
    await assert.rejects(() => users().except('id', 'is_admin').insert({ name: 'Eve' }), { code: 'MASS_ASSIGNMENT' })
  })

  test('only() writes the named columns and drops the rest', async () => {
    const { lastInsertRowid } = await users().only('name', 'email').insert({ name: 'Eve', email: 'eve@x.test', is_admin: 1 })
    const row = await users().find(lastInsertRowid)
    assert.strictEqual(row.name, 'Eve')
    assert.strictEqual(row.is_admin, 0)
    await users().where('id', lastInsertRowid).delete()
  })

  test('only() takes an array — a model fillable list', async () => {
    const fillable = ['name']
    const { changes } = await users().only(fillable).where('id', 2).update({ name: 'Grace', is_admin: 1 })
    assert.strictEqual(changes, 1)
    assert.strictEqual((await users().find(2)).is_admin, 0)
  })

  test('unguarded() keeps the old behaviour: everything but id', async () => {
    const { lastInsertRowid } = await users().unguarded().insert({ id: 999, name: 'Mallory', is_admin: 1 })
    assert.notStrictEqual(lastInsertRowid, 999)
    assert.strictEqual((await users().find(lastInsertRowid)).is_admin, 1)
    await users().where('id', lastInsertRowid).delete()
  })

  test('unguarded() still honours except()', async () => {
    const { lastInsertRowid } = await users().unguarded().except('id', 'is_admin').insert({ name: 'Trent', is_admin: 1 })
    assert.strictEqual((await users().find(lastInsertRowid)).is_admin, 0)
    await users().where('id', lastInsertRowid).delete()
  })

  test('reads and deletes need neither', async () => {
    assert.ok((await users().get()).length >= 3)
    const { changes } = await users().where('id', 12345).delete()
    assert.strictEqual(changes, 0)
  })
})

describe('null comparisons', () => {
  test('where(col, null) emits IS NULL', async () => {
    const qb = users().where('deleted_at', null)
    assert.match(qb.toSql(), /"deleted_at" IS NULL/)
    assert.deepStrictEqual(qb.getParams(), [])
    assert.deepStrictEqual((await qb.get()).map(u => u.name).sort(), ['Ada', 'Grace'])
  })

  test("where(col, '!=', null) emits IS NOT NULL", async () => {
    const rows = await users().where('deleted_at', '!=', null).get()
    assert.deepStrictEqual(rows.map(u => u.name), ['Linus'])
    assert.match(users().where('deleted_at', '<>', null).toSql(), /IS NOT NULL/)
  })

  test('undefined is refused, never read as IS NULL', async () => {
    // A missing input must not match every row whose column is empty.
    const token = undefined
    assert.throws(() => users().where('deleted_at', token), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().where('deleted_at', '=', undefined), /Pass null to compare with IS NULL/)
    assert.throws(() => users().where('deleted_at', '!=', undefined), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().orWhere('deleted_at', undefined), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().where(q => q.where('deleted_at', undefined)), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().where('email'), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().whereIn('id', [1, undefined]), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().where('id', 'IN', [undefined]), { code: 'UNDEFINED_VALUE' })
    assert.throws(() => users().whereIn('id', undefined), /needs an array/)
    assert.throws(() => users().whereNotIn('id', undefined), /needs an array/)
  })

  test('an undefined value in a write is left out, not written as NULL', async () => {
    const { lastInsertRowid } = await users().only('name', 'email').insert({ name: 'Uma', email: undefined })
    assert.strictEqual((await users().find(lastInsertRowid)).email, null)

    await users().only('email').where('id', lastInsertRowid).update({ email: 'uma@x.test' })
    // A missing input must not clear the column.
    await assert.rejects(() => users().only('email', 'name').where('id', lastInsertRowid).update({ email: undefined }), /No valid columns/)
    await users().only('email', 'name').where('id', lastInsertRowid).update({ email: undefined, name: 'Uma B' })
    const row = await users().find(lastInsertRowid)
    assert.strictEqual(row.email, 'uma@x.test')
    assert.strictEqual(row.name, 'Uma B')

    // null still writes NULL.
    await users().only('email').where('id', lastInsertRowid).update({ email: null })
    assert.strictEqual((await users().find(lastInsertRowid)).email, null)
    await users().where('id', lastInsertRowid).delete()
  })

  test('ordering operators refuse null', () => {
    assert.throws(() => users().where('id', '>', null), /Cannot compare id with null/)
  })

  test('update() with a null where binds the right placeholders on Postgres', async () => {
    const rec = recordingDb()
    await new QueryBuilder(rec, 'users', 'postgres').only('name').where('deleted_at', null).where('id', 3).update({ name: 'x' })
    assert.strictEqual(rec.calls[0].sql, 'UPDATE "users" SET "name" = $1 WHERE "deleted_at" IS NULL AND "id" = $2')
    assert.deepStrictEqual(rec.calls[0].params, ['x', 3])
  })
})

describe('whereIn', () => {
  test('expands to one placeholder per value', async () => {
    const qb = users().whereIn('id', [1, 2])
    assert.match(qb.toSql(), /"id" IN \(\?, \?\)/)
    assert.deepStrictEqual(qb.getParams(), [1, 2])
    assert.deepStrictEqual((await qb.get()).map(u => u.name).sort(), ['Ada', 'Grace'])
  })

  test("where(col, 'IN', [...]) is the same as whereIn", async () => {
    const rows = await users().where('id', 'in', [2, 3]).get()
    assert.deepStrictEqual(rows.map(u => u.id), [2, 3])
  })

  test('numbers Postgres placeholders across clauses', () => {
    const qb = new QueryBuilder(recordingDb(), 'users', 'postgres').where('name', 'a').whereIn('id', [1, 2, 3]).where('email', 'b')
    assert.match(qb.toSql(), /"name" = \$1 AND "id" IN \(\$2, \$3, \$4\) AND "email" = \$5/)
    assert.deepStrictEqual(qb.getParams(), ['a', 1, 2, 3, 'b'])
  })

  test('an empty list matches nothing; an empty NOT IN matches everything', async () => {
    assert.strictEqual((await users().whereIn('id', []).get()).length, 0)
    assert.strictEqual(await users().whereNotIn('id', []).count(), await users().count())
  })

  test('whereNotIn excludes', async () => {
    const rows = await users().whereNotIn('id', [1, 2]).get()
    assert.ok(rows.every(u => u.id !== 1 && u.id !== 2))
  })

  test('refuses something that is not an array', () => {
    assert.throws(() => users().whereIn('id', 1), /needs an array/)
  })
})

describe('orWhere', () => {
  test('joins with OR', async () => {
    const rows = await users().where('name', 'Ada').orWhere('name', 'Linus').orderBy('id').get()
    assert.deepStrictEqual(rows.map(u => u.name), ['Ada', 'Linus'])
  })

  test('a callback groups conditions in parentheses', async () => {
    const qb = posts().where('status', 'published').where(q => q.where('author_id', 1).orWhere('author_id', 2))
    assert.match(qb.toSql(), /WHERE "status" = \? AND \("author_id" = \? OR "author_id" = \?\)/)
    assert.deepStrictEqual((await qb.orderBy('id').get()).map(p => p.title), ['Hello World', '100% Done'])
  })

  test('orWhereNull, orWhereIn', async () => {
    const rows = await users().whereIn('id', [1]).orWhereNull('email').orderBy('id').get()
    assert.deepStrictEqual(rows.map(u => u.name), ['Ada', 'Linus'])
    const more = await users().where('id', 1).orWhereIn('id', [2]).get()
    assert.strictEqual(more.length, 2)
  })

  test('an empty group adds nothing', () => {
    assert.doesNotMatch(users().where(() => {}).toSql(), /WHERE/)
  })
})

describe('join', () => {
  test('inner join with qualified and aliased columns', async () => {
    const qb = posts()
      .select('posts.title', 'users.name as author')
      .join('users', 'posts.author_id', '=', 'users.id')
      .where('users.name', 'Ada')
      .orderBy('posts.id')

    assert.strictEqual(qb.toSql(),
      'SELECT "posts"."title", "users"."name" AS "author" FROM "posts" INNER JOIN "users" ON "posts"."author_id" = "users"."id" WHERE "users"."name" = ? ORDER BY "posts"."id" ASC')
    assert.deepStrictEqual((await qb.get()).map(r => ({ ...r })), [
      { title: 'Hello World', author: 'Ada' },
      { title: 'Draft_1', author: 'Ada' }
    ])
  })

  test('three-argument form and leftJoin', async () => {
    const rows = await posts().select('posts.*', 'users.name').leftJoin('users', 'posts.author_id', 'users.id').where('posts.title', 'Orphan').get()
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].name, null)
  })

  test('count() follows the join', async () => {
    assert.strictEqual(await posts().join('users', 'posts.author_id', 'users.id').count(), 3)
  })

  test('table aliases', () => {
    assert.match(posts().join('users as u', 'posts.author_id', 'u.id').toSql(), /INNER JOIN "users" AS "u" ON "posts"."author_id" = "u"."id"/)
  })

  test('identifiers in joins are validated', () => {
    assert.throws(() => posts().join('users; drop', 'a', 'b'), /Invalid identifier/)
    assert.throws(() => posts().join('users', 'posts.author_id', 'or 1=1', 'users.id'), /Invalid join operator/)
    assert.throws(() => posts().where('a.b.c', 1), /at most one table qualifier/)
  })

  test('update and delete refuse a join', async () => {
    await assert.rejects(() => posts().join('users', 'posts.author_id', 'users.id').delete(), /cannot be combined with join/)
    await assert.rejects(() => posts().join('users', 'posts.author_id', 'users.id').unguarded().update({ title: 'x' }), /cannot be combined with join/)
  })
})

describe('LIKE', () => {
  test('is case-insensitive on SQLite', async () => {
    const rows = await posts().where('title', 'LIKE', '%WORLD%').get()
    assert.deepStrictEqual(rows.map(p => p.title), ['Hello World'])
  })

  test('emits the same folded, escaped form on every dialect', () => {
    const pg = new QueryBuilder(recordingDb(), 'posts', 'postgres').where('title', 'like', '%a%').toSql()
    const lite = posts().where('title', 'LIKE', '%a%').toSql()
    assert.strictEqual(pg, `SELECT * FROM "posts" WHERE LOWER("title") LIKE LOWER($1) ESCAPE '\\'`)
    assert.strictEqual(lite, `SELECT * FROM "posts" WHERE LOWER("title") LIKE LOWER(?) ESCAPE '\\'`)
  })

  test('NOT LIKE folds too', async () => {
    const rows = await posts().where('title', 'NOT LIKE', '%world%').get()
    assert.ok(rows.every(p => p.title !== 'Hello World'))
  })

  test('escapeLike makes % and _ literal', async () => {
    assert.strictEqual(escapeLike('100%_a\\b'), '100\\%\\_a\\\\b')
    const pct = await posts().where('title', 'LIKE', `%${escapeLike('100%')}%`).get()
    assert.deepStrictEqual(pct.map(p => p.title), ['100% Done'])
    const underscore = await posts().where('title', 'LIKE', `%${escapeLike('_')}%`).get()
    assert.deepStrictEqual(underscore.map(p => p.title), ['Draft_1'])
  })
})

describe('paginate', () => {
  test('never emits NaN, whatever it is given', async () => {
    for (const [page, perPage] of [['abc', 'xyz'], [NaN, Infinity], ['-1', '0'], [{}, []]]) {
      const rec = recordingDb()
      await new QueryBuilder(rec, 'users').paginate(page, perPage)
      assert.strictEqual(rec.calls.length, 2)
      for (const { sql } of rec.calls) assert.doesNotMatch(sql, /NaN|Infinity/)
    }
  })
})
