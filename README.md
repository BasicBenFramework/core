# BasicBen

> A full-stack framework for React. Minimal dependencies, maximum clarity.

BasicBen gives you a productive, convention-driven structure for building React apps with a Node.js backend — without pulling in a bloated framework.

---

## Why BasicBen?

Most JS frameworks make one of two mistakes: they do too much (Next.js, Remix) or they do nothing and leave you to wire everything yourself. BasicBen sits in the middle.

- **Minimal dependencies** — core functionality is written from scratch. No Commander, no dotenv, no ORM.
- **Familiar conventions** — migrations, controllers, models, and scaffolding commands.
- **No lock-in** — just React, Node.js, and Vite. You own your stack.
- **Escape hatches** — every convention can be overridden via `basicben.config.js`.

---

## Requirements

- Node.js 20+
- npm 9+

---

## Quick Start

```bash
npx create-basicben-app my-app
cd my-app
npm install
npx basicben dev
```

Your app is running at `http://localhost:3000`.

---

## Project Structure

A new BasicBen project looks like this:

```
my-app/
├── src/
│   ├── routes/           # Auto-loaded API route files
│   │   └── users.js
│   ├── controllers/      # Business logic
│   │   └── UserController.js
│   ├── models/           # DB query wrappers
│   │   └── User.js
│   ├── middleware/       # Auto-loaded before routes
│   │   └── auth.js
│   └── client/           # React frontend
│       ├── main.jsx
│       └── App.jsx
├── migrations/
│   └── 001_create_users.js
├── public/
├── .env
├── .env.example
└── basicben.config.js
```

Routes, middleware, and models are loaded automatically — no manual imports needed.

---

## CLI

```bash
# Development
basicben dev                       # Start Vite + Node dev server
basicben build                     # Bundle client + server for production
basicben start                     # Run production server
basicben test                      # Run tests with Vitest

# Scaffolding
basicben make:controller <name>    # Generate a controller
basicben make:route <name>         # Generate a route file
basicben make:model <name>         # Generate a model
basicben make:migration <name>     # Generate a migration file
basicben make:middleware <name>    # Generate middleware (auth template if name is 'auth')

# Database
basicben migrate                   # Run all pending migrations
basicben migrate:rollback          # Roll back the last batch
basicben migrate:fresh             # Drop everything and re-run all
basicben migrate:status            # Show which migrations have run

# Help
basicben help                      # Show all commands
basicben help <command>            # Show help for a specific command
```

---

## Routing

Create a file in `src/routes/` and export a default function that receives the router:

```js
// src/routes/users.js
import { UserController } from '../controllers/UserController.js'

export default (router) => {
  router.get('/users', UserController.index)
  router.get('/users/:id', UserController.show)
  router.post('/users', UserController.create)
  router.put('/users/:id', UserController.update)
  router.delete('/users/:id', UserController.destroy)
}
```

All files in `src/routes/` are registered automatically on startup.

---

## Controllers

Generate one with:

```bash
basicben make:controller UserController
```

```js
// src/controllers/UserController.js
import { User } from '../models/User.js'

export const UserController = {
  index: async (req, res) => {
    const users = await User.all()
    res.json(users)
  },

  show: async (req, res) => {
    const user = await User.find(req.params.id)
    if (!user) return res.status(404).json({ error: 'Not found' })
    res.json(user)
  },

  create: async (req, res) => {
    const user = await User.create(req.body)
    res.status(201).json(user)
  },

  update: async (req, res) => {
    const user = await User.update(req.params.id, req.body)
    res.json(user)
  },

  destroy: async (req, res) => {
    await User.destroy(req.params.id)
    res.status(204).send()
  }
}
```

---

## Models

Generate one with:

```bash
basicben make:model User
```

Models are thin wrappers around raw DB queries — no ORM, no magic.

```js
// src/models/User.js
import { db } from '../db/index.js'

export const User = {
  all: () => db.all(`SELECT * FROM users`),
  find: (id) => db.get(`SELECT * FROM users WHERE id = ?`, id),
  create: (data) => db.run(`INSERT INTO users (name, email) VALUES (?, ?)`, [data.name, data.email]),
  update: (id, data) => db.run(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [data.name, data.email, id]),
  destroy: (id) => db.run(`DELETE FROM users WHERE id = ?`, id)
}
```

---

## Migrations

Generate a migration with:

```bash
basicben make:migration create_users
```

This creates a timestamped file in `migrations/`:

```js
// migrations/001_create_users.js
export const up = (db) => {
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

export const down = (db) => {
  db.run(`DROP TABLE users`)
}
```

Then run:

```bash
basicben migrate
```

BasicBen tracks which migrations have run in a `_migrations` table. Running `migrate` again is always safe.

### Rolling back

```bash
basicben migrate:rollback    # Undo the last batch
basicben migrate:fresh       # Drop everything and start over
basicben migrate:status      # See what's run and what hasn't
```

---

## Middleware

Create a file in `src/middleware/` and export a default function. Middleware is loaded automatically before routes, in filename order.

```js
// src/middleware/auth.js
export default (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  // verify token...
  next()
}
```

---

## Validation

BasicBen includes a lightweight validation system with 20+ built-in rules:

```js
import { validate, rules } from 'basicben/validation'

const result = await validate(req.body, {
  email: [rules.required, rules.email],
  password: [rules.required, rules.min(8)],
  age: [rules.optional, rules.integer, rules.between(18, 120)]
})

if (result.fails()) {
  return res.status(422).json({ errors: result.errors })
}

// result.data contains validated data
```

### Built-in Rules

`required`, `optional`, `string`, `numeric`, `integer`, `boolean`, `array`, `email`, `url`, `min`, `max`, `between`, `in`, `notIn`, `regex`, `confirmed`, `different`, `length`, `alpha`, `alphanumeric`, `date`, `before`, `after`

### Custom Rules

```js
const uniqueEmail = async (value) => {
  const exists = await db.get('SELECT 1 FROM users WHERE email = ?', value)
  return exists ? 'Email already exists' : null
}

await validate(req.body, {
  email: [rules.required, rules.email, uniqueEmail]
})
```

---

## Authentication

BasicBen provides JWT helpers using Node's built-in `crypto` module — no `jsonwebtoken` dependency:

```js
import { signJwt, verifyJwt } from 'basicben/auth'

// Sign a token
const token = signJwt({ userId: 1 }, process.env.APP_KEY, { expiresIn: '7d' })

// Verify a token
const payload = verifyJwt(token, process.env.APP_KEY)
if (!payload) {
  // Invalid or expired
}
```

Generate an auth middleware template:

```bash
basicben make:middleware auth
```

This creates a ready-to-use JWT auth middleware in `src/middleware/auth.js`.

---

## Testing

BasicBen uses Vitest for application tests:

```bash
basicben test              # Run once
basicben test --watch      # Watch mode
basicben test --coverage   # With coverage report
basicben test --ui         # Open Vitest UI
```

Create test files with `.test.js` or `.spec.js` suffix:

```js
// src/controllers/UserController.test.js
import { describe, it, expect } from 'vitest'
import { UserController } from './UserController.js'

describe('UserController', () => {
  it('returns users list', async () => {
    const res = { json: vi.fn() }
    await UserController.index({}, res)
    expect(res.json).toHaveBeenCalled()
  })
})
```

---

## File-based Routing (Optional)

For Next.js-style routing, enable file-based routes in your config:

```js
// basicben.config.js
export default {
  fileRoutes: true
}
```

Then create files in `src/pages/`:

```
src/pages/
├── index.js           → GET /
├── users/
│   ├── index.js       → GET /users
│   └── [id].js        → GET/PUT/DELETE /users/:id
└── docs/
    └── [...slug].js   → GET /docs/* (catch-all)
```

Each file exports handlers:

```js
// src/pages/users/[id].js
export function get(req, res) {
  res.json({ user: req.params.id })
}

export function put(req, res) {
  // Update user
}

export function del(req, res) {
  // Delete user (del because delete is reserved)
}

// Optional route-specific middleware
export const middleware = [authMiddleware]
```

---

## Environment Variables

BasicBen uses Node 20's built-in `--env-file` support. No `dotenv` required.

Create a `.env` file at your project root:

```env
PORT=3000
DATABASE_URL=./database.sqlite
APP_KEY=your-secret-key
```

A `.env.example` is included in every new project. Commit that, not `.env`.

---

## Configuration

Override defaults in `basicben.config.js` at your project root:

```js
// basicben.config.js
export default {
  // Server port (API)
  port: 3001,

  // CORS settings
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
  },

  // Body parser
  bodyParser: {
    limit: '1mb'
  },

  // Static files
  static: {
    dir: 'public'
  },

  // Database
  db: {
    driver: 'sqlite',  // or 'postgres'
    url: process.env.DATABASE_URL || './data.db'
  },

  // Enable file-based routing (default: false)
  fileRoutes: false,

  // Auto-load routes from src/routes (default: true)
  autoloadRoutes: true,

  // Auto-load middleware from src/middleware (default: true)
  autoloadMiddleware: true
}
```

---

## Dependencies

BasicBen's dependency footprint is intentionally tiny:

```json
{
  "dependencies": {
    "polka": "^0.5.2"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18",
    "vite": ">=5",
    "@vitejs/plugin-react": ">=4"
  },
  "optionalDependencies": {
    "better-sqlite3": ">=9",
    "pg": ">=8"
  }
}
```

**One runtime dependency.** Polka is a 35-line Express-compatible HTTP server. Everything else is written from scratch:

- CLI argument parser (no Commander)
- Router with groups, middleware, named routes
- Validation (no Zod/Joi)
- JWT auth (no jsonwebtoken, uses node:crypto)
- Migrations (no Knex/Sequelize)
- Environment variables (uses Node 20's built-in --env-file)

---

## Guiding Principles

1. **Write it yourself before adding a dependency** — if it's under 200 lines, own it
2. **Conventions over configuration** — sensible defaults, optional overrides
3. **Error messages are features** — tell you exactly what went wrong and how to fix it
4. **Stay boring** — resist clever abstractions until they're obviously needed

---

## Contributing

BasicBen is early. Contributions, issues, and ideas are welcome.

```bash
git clone https://github.com/your-org/basicben
cd basicben
npm install
npm run dev
```

Please read `CONTRIBUTING.md` before opening a PR.

---

## Inspiration

BasicBen takes cues from Laravel's developer experience — migrations, controllers, models, and scaffolding commands that feel familiar to PHP developers. If you've used Laravel and wished the JS ecosystem felt that good, this is for you.

---

## License

MIT
