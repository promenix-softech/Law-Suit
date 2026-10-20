#!/usr/bin/env bash
# Applies migrations to a throwaway local Postgres database and runs the RLS tests.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/postgres bash scripts/test-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"
DB="civil_suits_test_$$"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$ADMIN_URL" -qc "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null' EXIT

psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/stub/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -tA -f "$ROOT/supabase/tests/rls_test.sql"
