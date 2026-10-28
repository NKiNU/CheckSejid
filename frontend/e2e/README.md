# E2E tests (Playwright)

Mobile-first (Pixel 7 viewport). The specs run against an **isolated stack with its own database**, never your dev data.

## One-time setup
```bash
docker exec checksejid-db-1 psql -U masyarakat -d postgres -c 'CREATE DATABASE e2e_test'
(cd ../backend && DATABASE_URL='postgresql://masyarakat:masyarakat@localhost:5432/e2e_test?schema=public' npx prisma migrate deploy)
docker compose up -d storage && curl -X PUT http://localhost:9000/e2e      # S3 for the erasure archive
npx playwright install chromium                                            # or use the cached browser
```

## Start the stack
```bash
# API on :3190. TRUST_PROXY=1 lets each test present its own client IP (login is rate limited per IP).
cd ../backend && TRUST_PROXY=1 PORT=3190 JWT_ACCESS_SECRET=$(openssl rand -hex 32) \
  DATABASE_URL='postgresql://masyarakat:masyarakat@localhost:5432/e2e_test?schema=public' \
  S3_ENDPOINT=http://localhost:9000 S3_REGION=us-east-1 S3_BUCKET=e2e S3_ACCESS_KEY_ID=x S3_SECRET_ACCESS_KEY=x \
  S3_PUBLIC_BASE_URL=http://localhost:9000/e2e ERASURE_KEY_DIR=/tmp/e2e-keys npx tsx src/server.ts
# frontend on :5174, proxied to that API
API_URL=http://localhost:3190 npx vite --port 5174 --strictPort
```

## Run
```bash
e2e/reset.sh r1                 # fresh users; the suffix must be new every run (login is limited per email)
E2E_RUN=r1 npm run e2e          # specs 01-04; screenshots go to e2e/screenshots/
```
Specs build on each other (one organisation, one worker). `05-erasure-run` is skipped unless `E2E_PHASE` is set, because the
real grace period is 7 days:
```bash
E2E_RUN=r1 E2E_PHASE=request npx playwright test e2e/05-erasure-run.e2e.ts
docker exec checksejid-db-1 psql -U masyarakat -d e2e_test -c "UPDATE \"ErasureRequest\" SET \"executeAfter\" = now() WHERE status = 'PENDING_GRACE'"
# restart the API: its startup job runs the due erasure; then check the archive row, key file and ledger object
E2E_RUN=r1 E2E_PHASE=done npx playwright test e2e/05-erasure-run.e2e.ts
```

## What it covers
01 login/redirect, organisation create + onboarding, members, password change · 02 retention, organisation and account
erasure requests, cancel, notifications · 03 consented support access (request, approve, read-only, end, deny, audit log) ·
04 public discovery, visibility, follow/unfollow · 05 the erasure actually running.
