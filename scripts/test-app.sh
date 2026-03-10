#!/bin/bash

# Test script for BasicBen framework
# Deletes my-test-app, creates a fresh one, and runs migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== BasicBen Test App Setup ==="
echo ""

# Step 1: Delete existing my-test-app
if [ -d "$ROOT_DIR/my-test-app" ]; then
  echo "Removing existing my-test-app..."
  rm -rf "$ROOT_DIR/my-test-app"
fi

# Step 2: Create new test app with --local flag
echo "Creating new test app..."
cd "$ROOT_DIR"
node create-basicben-app/index.js my-test-app --local

# Step 3: Configure .env with port 3002 for frontend
echo "Configuring .env..."
APP_KEY=$(openssl rand -base64 32)
cat > "$ROOT_DIR/my-test-app/.env" << EOF
# Application
APP_KEY=$APP_KEY

# Server Ports
PORT=3001              # API server
VITE_PORT=3002         # Frontend dev server

# Database
DATABASE_URL=./database.sqlite
EOF

# Step 4: Install dependencies
echo ""
echo "Installing dependencies..."
cd "$ROOT_DIR/my-test-app"
npm install

# Step 5: Run migrations
echo ""
echo "Running migrations..."
npm run migrate

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the dev server:"
echo "  cd my-test-app"
echo "  npm run dev"
echo ""
echo "Frontend: http://localhost:3002"
echo "API:      http://localhost:3001"
