#!/bin/bash
#
# The committed declarations, verified two ways.
#
# Both checks used to live in the CMS smoke test, which packed this repository.
# They belong here: they compare this package's committed `types/` against this
# package's JSDoc, and need this source to do it.
#
# 1. Freshness. The declarations are generated from JSDoc, so an edit to a
#    signature that skips `npm run build:types` ships types describing the
#    previous version.
#
# 2. Self-consistency. Apps compile with skipLibCheck, so a malformed
#    declaration still lets every app typecheck. JSDoc that emitted an optional
#    parameter before a required one produced exactly that: an invalid .d.ts
#    nobody saw until an editor complained.

set -euo pipefail

ROOT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

cd "$ROOT_DIR"

if [ ! -x ./node_modules/.bin/tsc ]; then
  echo "tsc not installed — run npm ci first"
  exit 1
fi

./node_modules/.bin/tsc -p tsconfig.types.json --outDir "$WORK_DIR/types-fresh" > /dev/null 2>&1

if ! diff -rq types "$WORK_DIR/types-fresh" > "$WORK_DIR/types.diff" 2>&1; then
  echo "--- stale declarations ---"
  head -20 "$WORK_DIR/types.diff"
  fail "types/ is out of date — run 'npm run build:types' and commit the result"
fi
pass "committed declarations match the JSDoc"

if ! ./node_modules/.bin/tsc --noEmit --skipLibCheck false \
       --strict false --moduleResolution bundler --module esnext \
       --target es2022 --lib es2022,dom,dom.iterable \
       $(find types -name '*.d.ts') > "$WORK_DIR/dts.log" 2>&1; then
  echo "--- declarations do not check on their own ---"
  head -20 "$WORK_DIR/dts.log"
  fail "generated declarations are not self-consistent"
fi
pass "declarations check on their own, without skipLibCheck"
