/**
 * Migrations from a list of directories.
 *
 * An app whose schema ships in a package keeps its own migrations beside the
 * package's: `migrations: [<package>/db/migrations, 'db/migrations']` in
 * basicben.config.js. Names stay bare in `_migrations`, so a database migrated
 * from one directory reads the same once the files are split across two.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteAdapter } from './adapters/sqlite.js'
import { createMigrator } from './migrator.js'

let root
let db
let pkg
let site

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'basicben-dirs-'))
  pkg = join(root, 'pkg')
  site = join(root, 'site')
  mkdirSync(pkg)
  mkdirSync(site)
  db = await createSqliteAdapter(join(root, 'test.db'))
})

afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

function table(dir, name, table) {
  writeFileSync(
    join(dir, `${name}.js`),
    `export const up = async (db) => { await db.exec('CREATE TABLE ${table} (id INTEGER PRIMARY KEY)') }
     export const down = async (db) => { await db.exec('DROP TABLE ${table}') }`
  )
}

const recorded = () => db.all('SELECT migration, batch FROM _migrations ORDER BY id').map((r) => r.migration)

describe('a list of directories', () => {
  test('runs them in list order, lexically within each', async () => {
    table(pkg, '002_posts', 'posts')
    table(pkg, '001_users', 'users')
    // Sorts before the package's files, but its directory comes second.
    table(site, '000_site_extra', 'extra')

    const { ran } = await createMigrator([pkg, site], db).then((m) => m.migrate())

    assert.deepStrictEqual(ran, ['001_users', '002_posts', '000_site_extra'])
    assert.deepStrictEqual(recorded(), ['001_users', '002_posts', '000_site_extra'])
  })

  test('records bare names, so moving files between directories changes nothing', async () => {
    table(site, '001_users', 'users')
    await createMigrator(site, db).then((m) => m.migrate())

    // The same file, now shipped by a package.
    rmSync(join(site, '001_users.js'))
    table(pkg, '001_users', 'users')

    const migrator = await createMigrator([pkg, site], db)
    assert.deepStrictEqual((await migrator.migrate()).ran, [])
    assert.deepStrictEqual(await migrator.status(), [{ name: '001_users', ran: true, batch: 1 }])
  })

  test('refuses a name found in two directories, naming both files', async () => {
    table(pkg, '001_users', 'users')
    table(site, '001_users', 'users')

    await assert.rejects(createMigrator([pkg, site], db), (err) => {
      assert.match(err.message, /Two migrations are named 001_users/)
      assert.ok(err.message.includes(join(pkg, '001_users.js')))
      assert.ok(err.message.includes(join(site, '001_users.js')))
      return true
    })
    assert.strictEqual(db.all("SELECT name FROM sqlite_master WHERE name = 'users'").length, 0)
  })

  test('rolls back a file from whichever directory holds it', async () => {
    table(pkg, '001_users', 'users')
    table(site, '2026_01_01_000000_notes', 'notes')

    const migrator = await createMigrator([pkg, site], db)
    await migrator.migrate()
    const { rolledBack } = await migrator.rollback()

    assert.deepStrictEqual(rolledBack, ['2026_01_01_000000_notes', '001_users'])
    assert.deepStrictEqual(recorded(), [])
  })

  test('treats a missing directory as empty', async () => {
    table(pkg, '001_users', 'users')

    const { ran } = await createMigrator([pkg, join(root, 'nope')], db).then((m) => m.migrate())
    assert.deepStrictEqual(ran, ['001_users'])
  })

  test('a single directory still works as a string', async () => {
    table(site, '001_users', 'users')

    const { ran } = await createMigrator(site, db).then((m) => m.migrate())
    assert.deepStrictEqual(ran, ['001_users'])
  })

  test('refuses an empty list or a non-string entry', async () => {
    await assert.rejects(createMigrator([], db), /a directory or a list of directories/)
    await assert.rejects(createMigrator([pkg, 42], db), /a directory or a list of directories/)
  })

  test('comes from `migrations` in basicben.config.js when none is passed', async () => {
    table(pkg, '001_users', 'users')
    table(site, '002_notes', 'notes')
    writeFileSync(join(root, 'basicben.config.js'), `export default { migrations: [${JSON.stringify(pkg)}, 'site'] }`)

    const cwd = process.cwd()
    process.chdir(root)
    try {
      const { ran } = await createMigrator(undefined, db).then((m) => m.migrate())
      assert.deepStrictEqual(ran, ['001_users', '002_notes'])
    } finally {
      process.chdir(cwd)
    }
  })
})
