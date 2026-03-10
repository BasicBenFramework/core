# Testing BasicBen

## Quick Start

```bash
# Run all tests
npm test

# Run tests for a specific module
npm run test:db
npm run test:validation
npm run test:auth
npm run test:server
npm run test:cli
npm run test:scaffolding
```

---

## Test Modules

### Database (`src/db/`)

```bash
npm run test:db
```

Tests for:
- SQLite adapter
- PostgreSQL adapter
- Turso, PlanetScale, Neon adapters (skipped if not configured)
- QueryBuilder (fluent API)
- Grammar (SQL escaping/validation)
- Seeder

### Validation (`src/validation/`)

```bash
npm run test:validation
```

Tests for:
- Core `validate()` function
- Built-in rules (required, email, min, max, etc.)
- Custom rules
- Database rules (unique, exists)

### Auth (`src/auth/`)

```bash
npm run test:auth
```

Tests for:
- JWT signing and verification
- Password hashing

### Server (`src/server/`)

```bash
npm run test:server
```

Tests for:
- Router
- File-based routing

### CLI (`src/cli/`)

```bash
npm run test:cli
```

Tests for:
- Argument parser

### Scaffolding (`src/scaffolding/`)

```bash
npm run test:scaffolding
```

Tests for:
- File generation from stubs
- Name transformations

---

## Running Tests

### All tests

```bash
npm test
```

### With verbose output

```bash
node --test --test-reporter spec src/**/*.test.js
```

### Specific test file

```bash
node --test src/db/QueryBuilder.test.js
```

### With coverage

```bash
node --test --experimental-test-coverage src/**/*.test.js
```

---

## Testing with my-test-app

Create a local test app to test the full framework integration.

### Quick setup (recommended)

```bash
npm run test:app
```

Then start the dev server:

```bash
cd my-test-app
npm run dev
```

### Manual setup

```bash
# Create test app with local framework link
node create-basicben-app/index.js my-test-app --local

cd my-test-app
npm install
npm run migrate
npm run seed        # Populate with sample data
npm run dev
```

### Test credentials

After seeding:
- Email: `admin@example.com` or `test@example.com`
- Password: `password123`

### Configure ports (optional)

Edit `my-test-app/.env`:

```env
PORT=3001              # API server
VITE_PORT=3002         # Frontend dev server
```

### Clean up

```bash
rm -rf my-test-app
```

The `my-test-app/` directory is gitignored.

---

## Database Adapter Tests

Adapter tests are skipped unless the database is configured:

| Adapter | Environment Variables |
|---------|----------------------|
| SQLite | None (uses local file) |
| PostgreSQL | `DATABASE_URL` |
| Turso | `TURSO_URL`, `TURSO_AUTH_TOKEN` |
| PlanetScale | `PLANETSCALE_URL` or `PLANETSCALE_HOST` |
| Neon | `NEON_URL` |

To run adapter tests:

```bash
# Set environment variables
export TURSO_URL=libsql://your-db.turso.io
export TURSO_AUTH_TOKEN=your-token

# Run tests
npm run test:db
```

---

## Writing Tests

Tests use Node's built-in test runner:

```javascript
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'

describe('MyModule', () => {
  test('does something', async () => {
    const result = await myFunction()
    assert.strictEqual(result, expected)
  })
})
```

### Test file naming

- Place tests next to source files: `module.js` → `module.test.js`
- Or in a `__tests__/` directory

### Async tests

```javascript
test('async operation', async () => {
  const result = await asyncFunction()
  assert.ok(result)
})
```

### Skipping tests

```javascript
describe('Feature', { skip: !featureAvailable }, () => {
  // Tests only run if featureAvailable is true
})
```
