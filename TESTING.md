# Testing BasicBen

## Testing the Validation Module

The validation module (`src/validation/`) uses Node's built-in test runner.

### Run validation tests

```bash
node --test src/validation/index.test.js
```

### Run with verbose output

```bash
node --test --test-reporter spec src/validation/index.test.js
```

### Run all framework tests

```bash
node --test src/**/*.test.js
```

---

## Testing with my-test-app

Create a local test app to test the full framework:

### Create the test app

```bash
node create-basicben-app/index.js my-test-app --local
```

The `--local` flag links to the local framework instead of npm.

### Configure ports (optional)

Edit `my-test-app/.env` to change default ports:

```env
PORT=3001              # API server
VITE_PORT=3002         # Frontend dev server
```

### Install and run

```bash
cd my-test-app
npm install
npm run dev
```

This starts:
- Frontend (Vite): http://localhost:3002
- API server: http://localhost:3001

### Run app tests

```bash
cd my-test-app
npm test
```

### Clean up

The `my-test-app/` directory is gitignored. Delete it when done:

```bash
rm -rf my-test-app
```

---

## Test Coverage

To add coverage reporting, run:

```bash
node --test --experimental-test-coverage src/**/*.test.js
```
