#!/usr/bin/env bash
# ADR-026 §2: restore one dump over the live database. Usage: ops/restore.sh backups/masyarakat-<stamp>.dump
# List dumps: ops/s3.sh ls "s3://$S3_BUCKET/backups/"
set -euo pipefail
key="${1:?usage: ops/restore.sh backups/masyarakat-<stamp>.dump}"
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
C="docker compose -f docker-compose.prod.yml"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Download and validate BEFORE touching the database, so a bad download never destroys live data.
ops/s3.sh cp "s3://$S3_BUCKET/$key" - > "$tmp"
$C exec -T db pg_restore --list < "$tmp" > /dev/null

$C stop api
$C exec -T db sh -c 'dropdb -U masyarakat --force masyarakat && createdb -U masyarakat masyarakat'
$C exec -T db pg_restore -U masyarakat -d masyarakat --no-owner < "$tmp"
$C start api
echo "restored $key"
