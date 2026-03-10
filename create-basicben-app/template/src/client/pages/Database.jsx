import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'

export function Database() {
  const { t } = useTheme()

  const CodeBlock = ({ children, title }) => (
    <div className="mt-4">
      {title && <div className={`text-xs font-medium mb-2 ${t.muted}`}>{title}</div>}
      <div className={`rounded-lg p-4 font-mono text-sm ${t.card} border ${t.border} overflow-x-auto`}>
        <pre className={t.text}>{children}</pre>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Database"
        subtitle="Migrations, seeding, and queries"
      />

      <div className="space-y-6">
        {/* Migrations */}
        <Card>
          <h2 className="text-lg font-semibold mb-2">Migrations</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Migrations let you version control your database schema. Each migration has an <code>up</code> function to apply changes and a <code>down</code> function to reverse them.
          </p>

          <CodeBlock title="Generate a migration">
{`npx basicben make:migration create_posts`}
          </CodeBlock>

          <CodeBlock title="migrations/001_create_posts.js">
{`export const up = (db) => {
  db.exec(\`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  \`)
}

export const down = (db) => {
  db.exec('DROP TABLE posts')
}`}
          </CodeBlock>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npx basicben migrate</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Run pending migrations</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npx basicben migrate:rollback</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Undo last batch</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npx basicben migrate:fresh</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Drop all & re-run</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npx basicben migrate:status</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Show migration status</p>
            </div>
          </div>
        </Card>

        {/* Seeding */}
        <Card>
          <h2 className="text-lg font-semibold mb-2">Seeding</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Seeds populate your database with initial or test data. Create a seed file in the <code>seeds/</code> directory.
          </p>

          <CodeBlock title="seeds/users.js">
{`import { db } from 'basicben'
import { hashPassword } from 'basicben/auth'

export async function seed() {
  const password = await hashPassword('password123')

  await (await db.table('users')).insert({
    name: 'Admin User',
    email: 'admin@example.com',
    password
  })

  await (await db.table('users')).insert({
    name: 'Test User',
    email: 'test@example.com',
    password
  })

  console.log('Seeded 2 users')
}`}
          </CodeBlock>

          <CodeBlock title="Run seeds">
{`# Run all seeds
npx basicben seed

# Run specific seed
npx basicben seed users`}
          </CodeBlock>
        </Card>

        {/* Query Builder */}
        <Card>
          <h2 className="text-lg font-semibold mb-2">Query Builder</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            The query builder provides a fluent API for database queries with built-in SQL injection protection.
          </p>

          <CodeBlock title="Basic queries">
{`import { db } from 'basicben'

// Get all users
const users = await (await db.table('users')).get()

// Find by ID
const user = await (await db.table('users')).find(1)

// Filter with where
const admins = await (await db.table('users'))
  .where('is_admin', true)
  .get()

// Chain multiple conditions
const results = await (await db.table('posts'))
  .where('published', true)
  .where('user_id', userId)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .get()`}
          </CodeBlock>

          <CodeBlock title="Insert & Update">
{`// Insert a record
const result = await (await db.table('posts'))
  .insert({
    title: 'My Post',
    content: 'Hello world',
    user_id: 1
  })

console.log(result.lastInsertRowid) // New ID

// Update records
await (await db.table('posts'))
  .where('id', postId)
  .update({ title: 'Updated Title' })

// Delete records
await (await db.table('posts'))
  .where('id', postId)
  .delete()`}
          </CodeBlock>

          <CodeBlock title="Aggregates & Pagination">
{`// Count records
const count = await (await db.table('posts'))
  .where('published', true)
  .count()

// Check existence
const exists = await (await db.table('users'))
  .where('email', 'test@example.com')
  .exists()

// Paginate results
const page = await (await db.table('posts'))
  .orderBy('created_at', 'DESC')
  .paginate(1, 15)

// Returns: { data, total, page, perPage, totalPages }`}
          </CodeBlock>
        </Card>

        {/* Mass Assignment Protection */}
        <Card>
          <h2 className="text-lg font-semibold mb-2">Mass Assignment Protection</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Prevent users from setting fields they shouldn't (like <code>is_admin</code>) by using <code>only()</code> or <code>except()</code>.
          </p>

          <CodeBlock title="Whitelist with only()">
{`// Only allow these fields to be set
await (await db.table('users'))
  .only('name', 'email', 'bio')
  .insert(req.body)

// Extra fields in req.body are ignored
// { name: 'Bob', email: 'bob@test.com', is_admin: true }
// is_admin is silently dropped`}
          </CodeBlock>

          <CodeBlock title="Blacklist with except()">
{`// Block specific fields
await (await db.table('users'))
  .except('id', 'is_admin', 'created_at')
  .where('id', userId)
  .update(req.body)`}
          </CodeBlock>

          <CodeBlock title="In your models">
{`// src/models/User.js
export const User = {
  fillable: ['name', 'email', 'bio'],

  create: async (data) => {
    return (await db.table('users'))
      .only(...User.fillable)
      .insert(data)
  },

  update: async (id, data) => {
    return (await db.table('users'))
      .only(...User.fillable)
      .where('id', id)
      .update(data)
  }
}`}
          </CodeBlock>
        </Card>

        {/* Raw Queries */}
        <Card>
          <h2 className="text-lg font-semibold mb-2">Raw Queries</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            For complex queries, you can use raw SQL with parameterized queries.
          </p>

          <CodeBlock title="Using db directly">
{`import { db } from 'basicben'

// Parameterized queries (safe from SQL injection)
const posts = await db.all(
  'SELECT * FROM posts WHERE user_id = ? AND published = ?',
  [userId, true]
)

// Single row
const user = await db.get(
  'SELECT * FROM users WHERE email = ?',
  [email]
)

// Insert/Update/Delete
const result = await db.run(
  'INSERT INTO posts (title, user_id) VALUES (?, ?)',
  [title, userId]
)

// Transactions
await db.transaction(async (tx) => {
  await tx.run('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, fromId])
  await tx.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, toId])
})`}
          </CodeBlock>
        </Card>
      </div>
    </div>
  )
}
