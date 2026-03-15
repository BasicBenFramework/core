import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'

interface CodeBlockProps {
  children: string
  title?: string
}

interface Rule {
  rule: string
  desc: string
}

export function Validation() {
  const { t } = useTheme()

  const CodeBlock = ({ children, title }: CodeBlockProps) => (
    <div className="mt-4">
      {title && <div className={`text-xs font-medium mb-2 ${t.muted}`}>{title}</div>}
      <div className={`rounded-lg p-4 font-mono text-sm ${t.card} border ${t.border} overflow-x-auto`}>
        <pre className={t.text}>{children}</pre>
      </div>
    </div>
  )

  const rules: Rule[] = [
    { rule: 'required', desc: 'Field must be present and not empty' },
    { rule: 'email', desc: 'Must be a valid email address' },
    { rule: 'number', desc: 'Must be a number' },
    { rule: 'string', desc: 'Must be a string' },
    { rule: 'minLength(n)', desc: 'String must be at least n characters' },
    { rule: 'maxLength(n)', desc: 'String must be at most n characters' },
    { rule: 'min(n)', desc: 'Number must be at least n' },
    { rule: 'max(n)', desc: 'Number must be at most n' },
  ]

  return (
    <div>
      <PageHeader title="Validation" />

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Basic Usage</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Validate request data using the <code>validate</code> function and built-in rules.
          </p>

          <CodeBlock title="Validating request body">
{`import { validate, rules } from 'basicben/validation'

export const store = async (req, res) => {
  const result = await validate(req.body, {
    title: [rules.required, rules.minLength(3)],
    email: [rules.required, rules.email],
    age: [rules.required, rules.number, rules.min(18)]
  })

  if (!result.valid) {
    return res.status(400).json({ errors: result.errors })
  }

  // Data is valid, continue...
}`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Available Rules</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            BasicBen includes commonly used validation rules out of the box.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {rules.map(({ rule, desc }) => (
              <div key={rule} className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
                <code className="text-sm font-semibold">{rule}</code>
                <p className={`text-xs mt-1 ${t.muted}`}>{desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Database Rules</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Validate against your database with <code>unique</code> and <code>exists</code> rules.
          </p>

          <CodeBlock title="Unique validation">
{`// Check if email is unique in users table
email: [rules.required, rules.email, rules.unique('users')]

// Exclude current record (for updates)
email: [rules.unique('users', 'email', currentUserId)]`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Custom Rules</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Create custom validation rules for specific requirements.
          </p>

          <CodeBlock title="Creating a custom rule">
{`// Custom rule as a function
const isSlug = (value, field) => {
  if (!/^[a-z0-9-]+$/.test(value)) {
    return \`\${field} must only contain lowercase letters, numbers, and hyphens\`
  }
  return null // Return null if valid
}

// Use it in validation
const result = await validate(req.body, {
  slug: [rules.required, isSlug]
})`}
          </CodeBlock>
        </Card>
      </div>
    </div>
  )
}
