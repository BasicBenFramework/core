# BasicBen

> Ship faster with less. A full-stack framework for React. Zero runtime dependencies.

BasicBen gives you a productive, convention-driven structure for building React apps with a Node.js backend — without pulling in a bloated framework or locking you into vendor ecosystems.

---

## Why BasicBen?

Most JS frameworks make one of two mistakes: they do too much (Next.js, Remix) or they do nothing and leave you to wire everything yourself. BasicBen sits in the middle — conventions when you want them, escape hatches when you don't.

| Framework | Trade-off |
|-----------|-----------|
| Next.js / Remix | Too much magic, vendor lock-in |
| Express + Vite | Wire everything yourself |
| **BasicBen** | ✅ Conventions + control |

### Core Principles

- **Zero runtime dependencies** — HTTP server, router, JWT auth, validation — all written from scratch using Node.js built-ins
- **Laravel-inspired DX** — migrations, controllers, models, and scaffolding commands that feel familiar
- **No lock-in** — just React, Node.js, and Vite. Eject anytime — your code is still your code
- **Escape hatches** — every convention can be overridden via `basicben.config.js`

---

## Requirements

- Node.js 24.14+
- npm 9+

---

## Quick Start

```bash
npx create-basicben-app my-app
cd my-app
npm install
npx basicben migrate
npx basicben dev
```

Your app is running at `http://localhost:3000` with a fully functional blog app — user auth, posts, and profiles included.

### Local Development

To develop against a local copy of the framework:

```bash
npx create-basicben-app my-app --local
```

This sets the `basicben` dependency to `file:../basicben-framework` instead of fetching from npm.

---

## Project Structure

A new BasicBen project looks like this:

```
my-app/
├── index.html               # Vite entry point
├── src/
│   ├── main.jsx             # React entry point
│   ├── routes/
│   │   ├── App.jsx          # Client routes
│   │   └── api/             # Auto-loaded API routes
│   │       ├── auth.js
│   │       ├── posts.js
│   │       └── profile.js
│   ├── controllers/         # Business logic
│   │   ├── AuthController.js
│   │   ├── PostController.js
│   │   └── ProfileController.js
│   ├── models/              # DB query wrappers
│   │   ├── User.js
│   │   └── Post.js
│   ├── middleware/          # Route middleware
│   │   └── auth.js
│   ├── helpers/             # Utility functions
│   │   └── api.js           # Fetch wrapper with auth
│   └── client/              # React frontend
│       ├── layouts/         # Layout components
│       │   ├── AppLayout.jsx
│       │   ├── AuthLayout.jsx
│       │   └── DocsLayout.jsx
│       ├── pages/           # Page components
│       │   ├── Home.jsx
│       │   ├── Auth.jsx
│       │   ├── Feed.jsx
│       │   ├── Posts.jsx
│       │   ├── Profile.jsx
│       │   └── ...
│       └── components/      # Reusable UI components
│           ├── Button.jsx
│           ├── Card.jsx
│           ├── Input.jsx
│           └── ...
├── migrations/
│   ├── 001_create_users.js
│   └── 002_create_posts.js
├── public/
└── basicben.config.js
```

Routes, middleware, and models are loaded automatically — no manual imports needed.

---

## Starter Features

Every new BasicBen project includes a fully functional blog app:

### Authentication
- User registration and login with JWT
- Protected routes with auth middleware
- Password hashing with `node:crypto`

### User Profile
- View and edit profile (name, email)
- Change password

### Blog Posts
- Create, edit, delete posts
- Publish/draft toggle
- List your own posts

### Public Feed
- View all published posts
- Single post view with author info

### React Components
The frontend uses reusable components:
- `Button`, `Input`, `Textarea`, `Card` — form elements
- `Alert`, `Loading`, `Empty` — feedback states
- `PageHeader`, `BackLink`, `Avatar` — layout helpers
- `ThemeContext` — light/dark mode support

---

## CLI

```bash
# Development
basicben dev                       # Start Vite + Node dev server
basicben build                     # Bundle client + server for production
basicben build --static            # Build client only (for static hosts)
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

### API Routes

Create a file in `src/routes/api/` and export a default function that receives the router:

```js
// src/routes/api/users.js
import { UserController } from '../../controllers/UserController.js'

export default (router) => {
  router.get('/api/users', UserController.index)
  router.get('/api/users/:id', UserController.show)
  router.post('/api/users', UserController.create)
  router.put('/api/users/:id', UserController.update)
  router.delete('/api/users/:id', UserController.destroy)
}
```

All files in `src/routes/api/` are registered automatically on startup.

### Client Routes

Client-side routing is configured in `src/routes/App.jsx`:

```js
// src/routes/App.jsx
import { createClientApp } from '@basicbenframework/core/client'
import { AppLayout } from '../client/layouts/AppLayout'
import { Home } from '../client/pages/Home'
import { Posts } from '../client/pages/Posts'

export default createClientApp({
  layout: AppLayout,
  routes: {
    '/': Home,
    '/posts': { component: Posts, auth: true },
  }
})
```

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

The starter template includes a complete auth system:

```js
// src/middleware/auth.js
import { verifyJwt } from 'basicben/auth'

export const auth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.json({ error: 'Unauthorized' }, 401)

  const payload = verifyJwt(token, process.env.APP_KEY)
  if (!payload) return res.json({ error: 'Invalid token' }, 401)

  req.userId = payload.userId
  next()
}
```

Use it in your routes:

```js
// src/routes/api/posts.js
import { auth } from '../../middleware/auth.js'
import { PostController } from '../../controllers/PostController.js'

export default (router) => {
  router.get('/api/posts', auth, PostController.index)
  router.post('/api/posts', auth, PostController.store)
}
```

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

  // Auto-load routes from src/routes (default: true)
  autoloadRoutes: true,

  // Auto-load middleware from src/middleware (default: true)
  autoloadMiddleware: true
}
```

---

## Dependencies

BasicBen has **zero runtime dependencies**:

```json
{
  "dependencies": {},
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18",
    "vite": ">=7",
    "@vitejs/plugin-react": ">=5"
  },
  "optionalDependencies": {
    "better-sqlite3": ">=12",
    "pg": ">=8"
  }
}
```

**Everything is written from scratch:**

- HTTP server (uses node:http)
- CLI argument parser (no Commander)
- Router with groups, middleware, named routes
- Validation (no Zod/Joi)
- JWT auth (no jsonwebtoken, uses node:crypto)
- Migrations (no Knex/Sequelize)
- Environment variables (uses Node's built-in --env-file)

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
git clone https://github.com/BasicBenFramework/basicben-framework
cd basicben-framework
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
