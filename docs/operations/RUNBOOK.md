# Production Runbook

How Masyarakat runs in production: ADR-014 (amended, DigitalOcean Singapore), ADR-025 (two Spaces, ClamAV), ADR-026 (operations).
Everything lives in the repository; secrets live only in the Droplet's `.env` and in GitHub Actions secrets.

## 1. One-time setup

### 1.1 Spaces (Singapore, `sgp1`)
1. **Create two Spaces:**
   - `masyarakat-private`: File Listing *Restricted*, **CDN off**. It holds finance evidence and backups.
   - `masyarakat-public`: File Listing *Restricted*, **CDN on**. It holds logos and covers only; they're uploaded `public-read` per object.
2. **Create a Spaces access key** (API → Spaces Keys). Use it for `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.
3. **Expire backups after 7 days** (ADR-026 §2). Run this once, from the Droplet, after §1.3 is done:
   ```sh
   cd /opt/masyarakat && set -a && . ./.env && set +a
   cat > /tmp/lc.json <<'JSON'
   {"Rules":[{"ID":"expire-backups","Status":"Enabled","Filter":{"Prefix":"backups/"},"Expiration":{"Days":7}}]}
   JSON
   docker run --rm -v /tmp/lc.json:/lc.json -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
     amazon/aws-cli --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" \
     s3api put-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --lifecycle-configuration file:///lc.json
   ```

### 1.2 Droplet
1. **Create the Droplet:** Ubuntu LTS, Singapore, about 4 GB RAM (ClamAV needs 2–3 GB). Use **SSH key login only**.
2. **Cloud Firewall:** inbound 22, 80 and 443 only. Postgres and ClamAV are never exposed.
3. **DNS:** an A record for your domain (e.g. `app.example.my`) pointing to the Droplet's IP.
4. **On the Droplet, as root:**
   ```sh
   apt-get update && apt-get install -y docker.io docker-compose-v2 git unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades          # automatic security updates
   adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
   mkdir -p /opt/masyarakat && chown deploy:deploy /opt/masyarakat
   ```
5. **As `deploy`:**
   ```sh
   git clone https://github.com/NKiNU/CheckSejid.git /opt/masyarakat
   cd /opt/masyarakat && cp .env.example .env && chmod 600 .env && nano .env   # fill every value
   ```
   Every value is described in `.env.example`.
   - Generate `POSTGRES_PASSWORD` with `openssl rand -hex 32` (it must be URL-safe).
   - Generate `JWT_ACCESS_SECRET` with `openssl rand -base64 48`.
   - `S3_PUBLIC_BASE_URL` is the public Space's CDN endpoint.

### 1.3 First deploy and platform admin
```sh
cd /opt/masyarakat && ops/deploy.sh
docker compose -f docker-compose.prod.yml exec api npm run platform-admin -- grant you@example.com "initial operator"
```
The first start of `clamd` downloads virus signatures (a few minutes). Until then, uploads return `503 SCANNER_UNAVAILABLE`, which is expected: uploads fail closed.

### 1.4 Automatic deploys (GitHub Actions)
1. On the Droplet, create a key pair just for deploys and authorise it for `deploy`:
   ```sh
   ssh-keygen -t ed25519 -N "" -f ~/deploy_key
   cat ~/deploy_key.pub >> ~/.ssh/authorized_keys
   ```
2. In GitHub → Settings → Environments, create `production` and add these secrets:
   - `DEPLOY_HOST` (IP or domain) and `DEPLOY_USER` (`deploy`);
   - `DEPLOY_SSH_KEY` (the contents of `~/deploy_key`), then delete that file from the Droplet;
   - `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan <host>`).
3. Every push to `main` that passes CI now runs `ops/deploy.sh`. A manual run is in Actions → Deploy → Run workflow.

## 2. Routine operations

| Task | Command (on the Droplet, in `/opt/masyarakat`) |
|---|---|
| Deploy (pull `main`, build, migrate, restart) | `ops/deploy.sh` |
| Status | `docker compose -f docker-compose.prod.yml ps` |
| Logs (rotated, no secrets) | `docker compose -f docker-compose.prod.yml logs --tail 200 api` |
| Grant/revoke platform admin (audited) | `docker compose -f docker-compose.prod.yml exec api npm run platform-admin -- grant\|revoke <email> "<reason>"` |
| Run a backup now | `ops/backup.sh` |
| List backups | `set -a; . ./.env; set +a; ops/s3.sh ls "s3://$S3_BUCKET/backups/"` |

Rollback of a bad release:
```sh
git checkout <previous-good-commit>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```
Migrations are forward-only, so if the bad release changed the schema, restore the last backup (§3) instead.

## 3. Backups and restore (ADR-026 §2: RPO 24 h, RTO 1 day)

**Nightly backup.** Install this cron entry as `deploy` (`crontab -e`):
```
0 3 * * * /opt/masyarakat/ops/backup.sh >> /home/deploy/backup.log 2>&1
```
Check `~/backup.log` for a daily `backup ok:` line. Files in Spaces are not in the database backup.

**Restore.**
```sh
ops/restore.sh backups/masyarakat-<stamp>.dump
```
It downloads the dump and validates it **before** touching the database. A missing or corrupt dump aborts with the live database untouched. It then stops the API, recreates the database from the dump, and starts the API again.

**Tested restore (2026-10-06, local production stack).** This used the real `docker-compose.prod.yml` (Caddy, API, Postgres) with an S3-compatible server standing in for Spaces. Results:
1. Created a user and an organisation through the API over HTTPS.
2. `ops/backup.sh` uploaded the dump to the private bucket.
3. Deleted the organisation rows; organisations = 0.
4. `ops/restore.sh <key>` finished in **about 4 seconds**.
5. Organisations = 1, the user could log in, and `/health` was ok.
6. A restore with a non-existent key exited 1, and the live data and API were untouched.

Repeat this drill on the real Droplet after the first deploy, and once per quarter. Note the date here.

## 4. Monitoring (ADR-026 §3)
- **Uptime:** DigitalOcean → Monitoring → Uptime → new check on `https://<domain>/health`, alerting your email. `/health` returns 503 when the database is down.
- **Droplet alerts:** DigitalOcean Monitoring alert policies for CPU > 90 %, memory > 90 % and disk > 80 %, by email.
- **Scanner:** if users report `503 SCANNER_UNAVAILABLE`, run `docker compose -f docker-compose.prod.yml logs clamd`. `clamd` updates its signatures itself (freshclam).

## 5. Personal-data requests (PDPA, ADR-026 §6)
**Deletion is self-service since ADR-029/ADR-031**: the owner or user requests it in the app (password, 7-day grace, cancellable) and the hourly job runs it. Use the manual steps below for access or correction requests, or if the app cannot be used.

**Erasure operations (ADR-031):**
- `ERASURE_KEY_DIR` must be a persistent volume, writable by the API, set in `.env`. The API refuses to start in production without it. Keys are the only way to open a retained archive: keep this volume out of backups, or treat any backup or Droplet snapshot that has it as holding archive keys and let it age out within 7 days.
- Erased data stays in nightly database dumps for up to 7 days (ADR-026). **After restoring a backup, replay every erasure** completed after the dump: list the `erasure-ledger/` objects in the private Space newer than the dump, insert a `PENDING_GRACE` `ErasureRequest` with `executeAfter = now()` for each (kind and subject id are in the object), and run the job before opening the service.
- A request in `FAILED` can be retried by the requester in the app. Read the API log (`erasure: job failed`) first if the cause is unclear.

**Manual steps (access or correction; deletion only if the app is unavailable):**
1. Record the request in the operator log: requester, date, organisation, and what was asked (access, correction or deletion).
2. Verify the requester's identity, for example from the account's email address.
3. **Access or correction:** export or correct the user's rows with `psql` (`docker compose -f docker-compose.prod.yml exec db psql -U masyarakat masyarakat`).
4. **Deletion:** remove the person from organisations through the normal API flows first (audited).
   - Never delete finance records or audit logs. They are the organisation's records (FIN-011, FIN-015).
   - For the account itself, replace the user's name and email with placeholders (`deleted-<id>@invalid`) and revoke their sessions (delete their `RefreshToken` rows). Do not delete the row; history references it.
5. Reply to the requester, and record the action taken and the date.

## 6. Security checklist (before go-live)
- [ ] `.env` is mode 600 and not in git. GitHub secrets are set in the `production` environment only.
- [ ] Cloud Firewall allows 22, 80 and 443 only. SSH password login is disabled.
- [ ] `masyarakat-private` has CDN off and listing restricted. A finance file URL without a signature returns 403.
- [ ] The uptime check fires: stop the API briefly and confirm the email arrives.
- [ ] The restore drill (§3) is done on the Droplet and dated.
- [ ] The Malay text has been reviewed (`frontend/src/i18n/ms.ts`, keys marked `REVIEW:`).
- [ ] The cross-border transfer (data stored in Singapore) has been confirmed with your adviser (ADR-014 amendment).
