#!/bin/sh
# Daily copy of the database (cron.daily). sqlite3 .backup is safe while the API writes.
set -e
DATA=/var/lib/health
[ -f "$DATA/health.db" ] || exit 0
mkdir -p "$DATA/backups"
sqlite3 "$DATA/health.db" ".backup '$DATA/backups/health-$(date +%F).db'"
find "$DATA/backups" -name 'health-*.db' -mtime +14 -delete
