#!/bin/bash
#
# The scaffolder produces a usable project.
#
# It is a published artifact that can break on its own, and did: 0.5.0 shipped a
# bundled snapshot of the CMS that still called storage.url(), so every project
# made from it threw on any post with a featured image. It downloads the CMS at
# run time now, which cannot go stale — but the downloading, the exclusions and
# the renaming can still break, so they are checked here.
#
# It runs against what the scaffolder targets: the latest published
# @basicbenframework/cms and the site/ template at that release's tag. It needs
# network access; skip it with SKIP_SCAFFOLDER=1. To check an unreleased CMS,
# set CREATE_BASICBEN_SOURCE to a checkout and CREATE_BASICBEN_CMS_VERSION to
# the version it would publish.

set -euo pipefail

ROOT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

if [ -n "${SKIP_SCAFFOLDER:-}" ]; then
  echo "skipped (SKIP_SCAFFOLDER set)"
  exit 0
fi

cd "$WORK_DIR"

if ! node "$ROOT_DIR/create/index.js" probe-app > "$WORK_DIR/create.log" 2>&1; then
  cat "$WORK_DIR/create.log"
  fail "the scaffolder could not create a project"
fi

# A site holds the template, not the CMS: its source comes from the package.
for LEAK in src/models src/features db/migrations/001_create_users.js tests .github; do
  [ -e "probe-app/$LEAK" ] && fail "the scaffolder copied the CMS's $LEAK into a site"
done

[ -f probe-app/.gitignore ] || fail "the scaffolder left gitignore undotted"
for FILE in basicben.config.js vite.config.ts src/server/index.ts src/main.ts index.html vercel.json api/index.js; do
  [ -f "probe-app/$FILE" ] || fail "the site has no $FILE"
done

grep -qE '^APP_KEY=[0-9a-f]{64}$' probe-app/.env \
  || fail "the scaffolder did not generate an APP_KEY"

node -e "
const pkg = require('$WORK_DIR/probe-app/package.json')
if (pkg.name !== 'probe-app') { console.error('name is ' + pkg.name); process.exit(1) }
if (!pkg.dependencies['@basicbenframework/core']) { console.error('no core dependency'); process.exit(1) }
const cms = pkg.dependencies['@basicbenframework/cms'] || ''
if (!/^\\^\\d+\\.\\d+\\.\\d+/.test(cms)) { console.error('cms dependency is ' + cms); process.exit(1) }
" || fail "the site's package.json was not rewritten: name, and the CMS release it installs"

pass "the scaffolder produces a site that installs the CMS as a package"

# A ref that does not exist should say so rather than produce a broken project.
if env -u CREATE_BASICBEN_SOURCE node "$ROOT_DIR/create/index.js" bad-ref --ref no-such-ref > "$WORK_DIR/bad.log" 2>&1; then
  fail "the scaffolder accepted a ref that does not exist"
fi
grep -qi "no branch, tag or commit" "$WORK_DIR/bad.log" \
  || { cat "$WORK_DIR/bad.log"; fail "an unknown ref did not report itself clearly"; }
[ -e bad-ref ] && fail "a failed run left a half-written directory behind"
pass "an unknown ref fails cleanly, leaving nothing behind"
