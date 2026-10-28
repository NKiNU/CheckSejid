#!/bin/bash
# Wipe the isolated e2e database and seed the users the specs log in as. Never touches any other database.
# Usage: e2e/reset.sh <run-suffix>   then   E2E_RUN=<run-suffix> npm run e2e
# The API must be running on :3190 with TRUST_PROXY=1 (see e2e/README.md).
set -e
R="$1"   # suffix for the user emails: login is limited per email, so each run seeds fresh users
[ -n "$R" ] || { echo "usage: e2e/reset.sh <run-suffix>"; exit 2; }
DB=postgresql://masyarakat:masyarakat@localhost:5432/e2e_test?schema=public
docker exec checksejid-db-1 psql -q -U masyarakat -d e2e_test -c 'TRUNCATE "User", "Organisation", "ErasureRequest", "RetentionSetting", "ArchiveRecord", "SupportAccessGrant" CASCADE' 2>&1 | grep -v NOTICE || true
for u in owner member viewer admin changer; do
  curl -s -H "x-forwarded-for: 10.9.$RANDOM.$((RANDOM % 250 + 1))" -o /dev/null -w "$u %{http_code}  " -X POST localhost:3190/auth/register \
    -H 'content-type: application/json' -d "{\"email\":\"$u$R@e2e.test\",\"password\":\"e2e-Passw0rd-123\",\"displayName\":\"E2E $u\"}"
done
echo
(cd "$(dirname "$0")/../../backend" && DATABASE_URL="$DB" npm run -s platform-admin -- grant "admin$R@e2e.test" "e2e test admin" | tail -1)
