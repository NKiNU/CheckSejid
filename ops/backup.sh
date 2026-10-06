#!/usr/bin/env bash
# ADR-026 §2: nightly database dump to the private Space under backups/ (a lifecycle rule expires them
# after 7 days). Cron on the Droplet:
#   0 3 * * * /opt/masyarakat/ops/backup.sh >> /var/log/masyarakat-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
C="docker compose -f docker-compose.prod.yml"
key="backups/masyarakat-$(date -u +%Y%m%dT%H%M%SZ).dump"

# pipefail: a failed pg_dump fails the backup instead of uploading a partial file.
$C exec -T db pg_dump -U masyarakat -Fc masyarakat | ops/s3.sh cp - "s3://$S3_BUCKET/$key"
echo "$(date -u +%FT%TZ) backup ok: $key"
