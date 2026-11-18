#!/usr/bin/env bash
# ローカルの PostgreSQL にスキーマを適用し、権限（RLS）のテストを実行する
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DATA=$(mktemp -d)
PORT=${TEST_PG_PORT:-54329}
chown postgres "$DATA" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
run "$PGBIN/initdb -D $DATA -A trust -U postgres >/dev/null"
run "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log -w start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null"; rm -rf "$DATA"' EXIT
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f scripts/supabase-shim.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
TEST_DATABASE_URL="postgres://postgres@localhost:$PORT/postgres?host=/tmp" node --test "tests/db/*.test.mjs"
