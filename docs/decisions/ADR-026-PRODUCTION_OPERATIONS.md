# ADR-026-PRODUCTION_OPERATIONS

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-18 (backup and monitoring targets) and defers OQ-15 (data retention) to after MVP with a manual procedure. Applies ADR-014 Option D (DigitalOcean Singapore).

## Context
- `implementation-roadmap/PHASE_12_PRODUCTION.md`: "Prepare security, monitoring, backup and deployment." Acceptance: "Critical tests pass and deployment is repeatable." Out of scope: "Premature scaling."
- `architecture/SECURITY_ARCHITECTURE.md`: secret management, non-secret logging, dependency maintenance (SEC-002, SEC-003, SEC-008).
- ADR-014 (amended): one DigitalOcean Droplet in Singapore with PostgreSQL on it, and Spaces for files. ADR-025: ClamAV scan on upload, private and public Spaces.
- Product-owner answers (2026-10-06): "Basic" backups and monitoring; PostgreSQL on the Droplet; retention deferred with a manual process.

## Decision

### 1. Runtime: one Droplet, docker compose
One Droplet in Singapore (about 4 GB RAM, for ClamAV) runs `docker-compose.prod.yml` with four services:
- **caddy:** HTTPS with automatic certificates; serves the built frontend and routes the API paths to the API, on one domain (same-site cookie rule, ADR-009/ADR-014).
- **api:** the backend.
- **clamd:** ClamAV (ADR-025 §2).
- **db:** PostgreSQL 17, data on a Docker volume, not exposed outside the Droplet.

No load balancer, no second instance, no managed services beyond Spaces (no premature scaling).

### 2. Backups (OQ-18, "Basic")
- Every night, `ops/backup.sh` (host cron) runs `pg_dump` and uploads the dump to the private Space under `backups/`.
- A Spaces lifecycle rule deletes backups after **7 days**.
- **RPO 24 hours:** at most one day of data can be lost. **RTO 1 day:** service restored within one day.
- `ops/restore.sh` restores a chosen dump. The runbook records one tested restore.
- Uploaded files live in Spaces and are not part of the database backup.

### 3. Monitoring (OQ-18, "Basic")
- A DigitalOcean Uptime check calls `GET /health` every few minutes and emails the operator when it fails.
- `/health` checks the database, so a stopped database counts as down.
- Logs are Docker's JSON logs with size rotation. Error logs never contain secrets or request data (SEC-003): the error handler logs the error name, code, first message line and stack frames only, never the full error object.

### 4. Deployment (repeatable)
- `ops/deploy.sh` on the Droplet runs these steps; the same script is used every time:
  1. `git pull` of `main`;
  2. build the images;
  3. `prisma migrate deploy`;
  4. `docker compose up -d`.
- A GitHub Actions workflow runs it over SSH on push to `main`, after CI passes. It can also be run by hand.
- Secrets live only in `/opt/masyarakat/.env` on the Droplet (mode 600) and in GitHub Actions secrets (the deploy SSH key). Never in git (SEC-002).

### 5. Hardening
- SSH key login only. A DigitalOcean Cloud Firewall allows only ports 22, 80 and 443 in. Ubuntu unattended security upgrades are on.
- CI runs `npm audit --audit-level=high` on both apps. Dependabot opens weekly update PRs (SEC-008).

### 6. Data retention and PDPA requests (OQ-15, deferred)
- MVP keeps all data; nothing is hard-deleted automatically.
- A request to access, correct or delete personal data is handled manually by a platform administrator, following the procedure in the runbook. The request and the action taken are recorded.
- Retention periods and self-service account deletion are decided after MVP (OQ-15 stays open).

## Consequence
Phase 12 adds:
- the Dockerfiles, `docker-compose.prod.yml`, a `Caddyfile`, `ops/deploy.sh`, `ops/backup.sh` and `ops/restore.sh`;
- the deploy workflow, the CI audit step and the Dependabot config;
- the database check in `/health` and the secret-safe error logging;
- `docs/operations/RUNBOOK.md` (setup, deploy, backup, tested restore, monitoring, PDPA requests).
