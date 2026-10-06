#!/usr/bin/env bash
# ADR-026 §4: the one deploy procedure, run on the Droplet (by hand or by .github/workflows/deploy.yml).
set -euo pipefail
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml"

git pull --ff-only origin main
$C build
$C up -d db clamd
$C run --rm api npx prisma migrate deploy
$C up -d --remove-orphans
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
