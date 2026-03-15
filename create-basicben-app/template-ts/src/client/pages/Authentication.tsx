import { useTheme } from '../components/ThemeContext'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'

interface CodeBlockProps {
  children: string
  title?: string
}

export function Authentication() {
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
      <PageHeader title="Authentication" />

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            BasicBen includes a complete JWT-based authentication system with password hashing and middleware.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">JWT Tokens</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Stateless authentication</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">Bcrypt Hashing</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Secure password storage</p>
            </div>
            <div className={`rounded-lg p-3 ${t.card} border ${t.border}`}>
              <div className="font-semibold text-sm">Auth Middleware</div>
              <p className={`text-xs mt-1 ${t.muted}`}>Protect your routes</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Password Hashing</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Use bcrypt to securely hash and verify passwords.
          </p>

          <CodeBlock title="Hash and verify passwords">
{`import { hashPassword, verifyPassword } from 'basicben/auth'

// Hash a password (for registration)
const hashedPassword = await hashPassword('user-password')

// Verify a password (for login)
const isValid = await verifyPassword('user-password', hashedPassword)`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">JWT Tokens</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Generate and verify JWT tokens for stateless authentication.
          </p>

          <CodeBlock title="Generate and verify tokens">
{`import { generateToken, verifyToken } from 'basicben/auth'

// Generate a token (after successful login)
const token = await generateToken({ userId: user.id })

// Verify a token (in middleware)
const payload = await verifyToken(token)
console.log(payload.userId)`}
          </CodeBlock>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-2">Auth Middleware</h2>
          <p className={`text-sm ${t.muted} mb-4`}>
            Protect routes by requiring a valid JWT token.
          </p>

          <CodeBlock title="src/middleware/auth.js">
{`import { verifyToken } from 'basicben/auth'
import { db } from 'basicben'

export const auth = async (req, res, next) => {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const token = header.slice(7)
    const { userId } = await verifyToken(token)
    req.user = await (await db.table('users')).find(userId)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}`}
          </CodeBlock>
        </Card>
      </div>
    </div>
  )
}
