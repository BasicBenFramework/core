import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'

interface CodeBlockProps {
  children: string
  title?: string
}

interface BestPractice {
  title: string
  desc: string
}

export function Testing() {
  const { t } = useTheme()

  const CodeBlock = ({ children, title }: CodeBlockProps) => (
    <div className="mt-4">
      {title && <div className={`text-xs font-medium mb-2 ${t.muted}`}>{title}</div>}
      <div className={`rounded-lg p-4 font-mono text-sm ${t.card} border ${t.border} overflow-x-auto`}>
        <pre className={t.text}>{children}</pre>
      </div>
    </div>
  )

  const bestPractices: BestPractice[] = [
    { title: 'Isolate tests', desc: 'Each test should be independent' },
    { title: 'Reset state', desc: 'Use beforeEach to reset the database' },
    { title: 'Test behavior', desc: 'Test what the code does, not how' },
    { title: 'Use descriptive names', desc: 'Test names should describe expected behavior' },
    { title: 'Keep tests fast', desc: 'Mock external services' },
  ]

  return (
    <div>
      <PageHeader title="Testing" />

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            BasicBen uses Vitest for fast, modern testing.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npm run test</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Run tests once</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <code className="text-sm font-semibold">npm run test:watch</code>
              <p className={`text-xs mt-1 ${t.muted}`}>Run tests in watch mode</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Writing Tests</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Create test files alongside your code or in a <code>tests/</code> directory.
          </p>

          <CodeBlock title="src/utils/helpers.test.ts">
{`import { describe, it, expect } from 'vitest'
import { formatDate, slugify } from './helpers'

describe('formatDate', () => {
  it('formats a date correctly', () => {
    const date = new Date('2024-01-15')
    expect(formatDate(date)).toBe('January 15, 2024')
  })
})

describe('slugify', () => {
  it('converts text to a slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
})`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Testing API Routes</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Test your API endpoints using the built-in test client.
          </p>

          <CodeBlock title="tests/api/posts.test.ts">
{`import { describe, it, expect, beforeEach } from 'vitest'
import { testClient, resetDatabase } from 'basicben/testing'

describe('POST /api/posts', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates a post when authenticated', async () => {
    const { body, status } = await testClient
      .post('/api/posts')
      .auth(testUser)
      .send({ title: 'Test Post', content: 'This is a test' })

    expect(status).toBe(201)
    expect(body.id).toBeDefined()
  })
})`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Testing Best Practices</h2>
          <div className="space-y-3 mt-4">
            {bestPractices.map(({ title, desc }) => (
              <div key={title} className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
                <div className="font-semibold text-sm">{title}</div>
                <p className={`text-xs mt-1 ${t.muted}`}>{desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
