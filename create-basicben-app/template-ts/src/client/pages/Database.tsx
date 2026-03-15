import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'

interface CodeBlockProps {
  children: string
  title?: string
}

export function Database() {
  const { t } = useTheme()

  const CodeBlock = ({ children, title }: CodeBlockProps) => (
    <div className="mt-4">
      {title && <div className={`text-xs font-medium mb-2 ${t.muted}`}>{title}</div>}
      <div className={`rounded-lg p-4 font-mono text-sm ${t.card} border ${t.border} overflow-x-auto`}>
        <pre className={t.text}>{children}</pre>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Database" />

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Database Adapters</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            BasicBen supports multiple databases. Configure your adapter in <code>basicben.config.js</code>.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">SQLite</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Local file database (default)</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">PostgreSQL</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Traditional Postgres</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">Turso</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Edge SQLite (libSQL)</p>
            </div>
          </div>

          <CodeBlock title="basicben.config.js - SQLite (default)">
{`export default {
  db: {
    driver: 'sqlite',
    url: './database.sqlite'
  }
}`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Migrations</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Migrations let you version control your database schema.
          </p>

          <CodeBlock title="migrations/001_create_posts.js">
{`export const up = (db) => {
  db.exec(\`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Query Builder</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            The query builder provides a fluent API for database queries.
          </p>

          <CodeBlock title="Basic queries">
{`import { db } from 'basicben'

// Get all users
const users = await (await db.table('users')).get()

// Find by ID
const user = await (await db.table('users')).find(1)

// Filter with where
const results = await (await db.table('posts'))
  .where('published', true)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .get()`}
          </CodeBlock>
        </Card>
      </div>
    </div>
  )
}
