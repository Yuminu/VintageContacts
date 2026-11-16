#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/vintagecontacts/contacts.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vintagecontacts}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/contacts-$STAMP.sqlite'"
find "$BACKUP_DIR" -name 'contacts-*.sqlite' -mtime +14 -delete
echo "backup written to $BACKUP_DIR/contacts-$STAMP.sqlite"
