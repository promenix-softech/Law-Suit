#!/usr/bin/env bash
# Restore drill: decrypts a backup into a throwaway local database, checks row counts and the
# audit hash chain, then drops it. Never restore into a shared or production project.
#
#   DRILL_ADMIN_URL=postgres://postgres:…@localhost:5432/postgres BACKUP_PASSPHRASE_FILE=/secure/pass \
#     bash scripts/restore-drill.sh /var/backups/civil-suits/civil-suits-<ts>.dump.enc
set -euo pipefail

FILE="${1:?backup file}"
: "${DRILL_ADMIN_URL:?set DRILL_ADMIN_URL (local Postgres superuser)}"
: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="restore_drill_$$"
URL="${DRILL_ADMIN_URL%/*}/$DB"

sha256sum -c "$FILE.sha256"
psql "$DRILL_ADMIN_URL" -qc "create database $DB"
trap 'psql "$DRILL_ADMIN_URL" -qc "drop database if exists $DB"' EXIT

# Supabase platform objects (roles, auth.uid, storage) the schema refers to.
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/stub/supabase_stub.sql"
psql "$URL" -q -v ON_ERROR_STOP=1 -c "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
psql "$URL" -qc "drop schema public cascade"

DUMP="$(mktemp)"
trap 'rm -f "$DUMP"; psql "$DRILL_ADMIN_URL" -qc "drop database if exists $DB"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass "file:$BACKUP_PASSPHRASE_FILE" -in "$FILE" -out "$DUMP"
pg_restore --no-owner --no-privileges --exit-on-error --section=pre-data -d "$URL" "$DUMP"
pg_restore --no-owner --no-privileges --exit-on-error --section=data --disable-triggers -d "$URL" "$DUMP"
# auth.users is not in the backup: recreate the referenced ids so foreign keys can be restored.
psql "$URL" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare t text; c text; begin
  for t, c in
    select col.table_name, col.column_name
      from information_schema.columns col
      join information_schema.tables tab
        on tab.table_schema = col.table_schema and tab.table_name = col.table_name and tab.table_type = 'BASE TABLE'
     where col.table_schema = 'public' and col.data_type = 'uuid'
       and (col.column_name in ('created_by', 'uploaded_by', 'verified_by', 'approver_id', 'assigned_drafter',
                                'assigned_approver', 'user_id', 'assignee_id', 'actor_id')
            or (col.table_name = 'profiles' and col.column_name = 'id'))
  loop
    execute format('insert into auth.users (id) select distinct %I from public.%I where %I is not null on conflict do nothing', c, t, c);
  end loop;
end $$;
SQL
pg_restore --no-owner --no-privileges --exit-on-error --section=post-data -d "$URL" "$DUMP"

psql "$URL" -tA -c "select 'cases', count(*) from public.cases
                    union all select 'documents', count(*) from public.documents
                    union all select 'audit_log', count(*) from public.audit_log"
# The hash chain must recompute for every org.
psql "$URL" -tA -v ON_ERROR_STOP=1 -c "
  do \$\$ declare o uuid; r record; begin
    for o in select id from public.organizations loop
      perform set_config('request.jwt.claim.sub', (select ur.user_id::text from public.user_roles ur where ur.org_id = o and ur.role = 'admin' limit 1), true);
      select * into r from public.verify_audit_chain();
      if r.first_broken_id is not null then raise exception 'audit chain broken in org % at %', o, r.first_broken_id; end if;
    end loop;
  end \$\$;"
echo "restore drill OK: $(basename "$FILE")"
