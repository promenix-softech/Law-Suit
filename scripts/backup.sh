#!/usr/bin/env bash
# Encrypted database backup (offsite copy on top of Supabase's own backups).
#
#   BACKUP_DATABASE_URL=postgres://… BACKUP_PASSPHRASE_FILE=/secure/pass BACKUP_DIR=/var/backups/civil-suits \
#     bash scripts/backup.sh
#
# Writes <dir>/civil-suits-<UTC timestamp>.dump.enc (pg_dump custom format, AES-256 with a
# passphrase from a root-only file) plus a .sha256. Only the public schema: Supabase Auth users
# are covered by Supabase's own backups. Storage objects are copied separately with
# the S3-compatible API (rclone sync) — see docs/runbooks/backup-restore.md.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL (direct connection string, read-only role preferred)}"
: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

[ "$(stat -c %a "$BACKUP_PASSPHRASE_FILE")" = "600" ] || [ "$(stat -c %a "$BACKUP_PASSPHRASE_FILE")" = "400" ] \
  || { echo "passphrase file must be mode 600 or 400" >&2; exit 1; }
umask 077
mkdir -p "$DIR"
OUT="$DIR/civil-suits-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"

pg_dump --format=custom --no-owner --no-privileges --schema=public "$BACKUP_DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" -out "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "backup: $(basename "$OUT") $(du -h "$OUT" | cut -f1)"

find "$DIR" -name 'civil-suits-*.dump.enc*' -mtime "+$KEEP_DAYS" -delete
