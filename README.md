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

# Scaffolding
basicben make:controller <name>    # Generate a controller
basicben make:route <name>         # Generate a route file
basicben make:model <name>         # Generate a model
basicben make:migration <name>     # Generate a migration file

# Database
basicben migrate                   # Run all pending migrations
basicben migrate:rollback          # Roll back the last batch
basicben migrate:fresh             # Drop everything and re-run all
basicben migrate:status            # Show which migrations have run
basicben migrate:make <name>       # Alias for make:migration
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
  port: 3000,
  db: {
    driver: 'better-sqlite3',
    url: process.env.DATABASE_URL
  },
  vite: {
    // merged with BasicBen's base Vite config
  }
}
```

---

## Dependencies

BasicBen's dependency footprint is intentionally tiny:

```json
{
  "dependencies": {
    "vite": "latest",
    "@vitejs/plugin-react": "latest"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
```

No Express, no Commander, no dotenv, no ORM. Core functionality is written from scratch and stays that way.

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
