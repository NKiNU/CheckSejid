# ADR-014-HOSTING_AND_OBJECT_STORAGE

## Status
Accepted (2026-10-05) by the product owner, with the recommended option. Option B (AWS ap-southeast-5); the data-residency/PDPA check remains a Phase 12 task. Storage rules apply from Phase 05.

## Context
Spec lines that drive this decision:
- `architecture/SYSTEM_ARCHITECTURE.md`: "React/Vite frontend, Node.js/Express backend, approved database persistence, REST APIs and object storage … Introduce Redis, queues, microservices or distributed systems only when measurable requirements justify them."
- `architecture/SECURITY_ARCHITECTURE.md`: "secret management, safe file uploads, non-secret logging and dependency maintenance."
- `CHANGE_MANAGEMENT.md`: "Git is the authoritative history mechanism."
- `implementation-roadmap/PHASE_12_PRODUCTION.md`: "Prepare security, monitoring, backup and deployment"; acceptance: "deployment is repeatable"; out of scope: "Premature scaling."
- `finance/EXPENSE_MANAGEMENT.md`: evidence attachments follow file security rules.
- `modules/organisation/ORGANISATION_PROFILE.md`: logo and cover are public, while internal finance data is never public.
- ADR-008: the database is PostgreSQL. ADR-009: the refresh token lives in an httpOnly, Secure, SameSite cookie.

Data residency: tenants are Malaysian organisations storing personal data (members, contacts) and financial records, so the Personal Data Protection Act 2010 (as amended) applies. Cross-border transfer is permitted under conditions, but keeping data in Malaysia removes the question. **This ADR is not legal advice. Confirm residency obligations before choosing a non-Malaysian region.**

## Options

### A. Single VPS with docker-compose (any provider, nearest region)
App, PostgreSQL and a reverse proxy (e.g. Caddy) on one VM; S3-compatible storage from the same provider.
- Pro: cheapest, and the setup is very close to local development.
- Con: self-managed database backups, upgrades and restore testing, which is a real operational burden for Phase 12. A single point of failure.

### B. AWS Asia Pacific (Malaysia) region `ap-southeast-5`, minimal managed services (recommended)
One small compute instance (or a container service) running the backend container, RDS for PostgreSQL with automated backups and point-in-time recovery, a private S3 bucket for files, and the frontend served as static files from S3 + CloudFront.
- Pro: data stays in Malaysia; managed backups satisfy Phase 12 without extra tooling; S3 is the de-facto object-storage API; all boring and well documented.
- Con: costs more than A or D; AWS console and IAM complexity; confirm that each service is available in `ap-southeast-5` at the time of setup.

### C. Container PaaS + managed Postgres (e.g. Render, Railway, Fly.io)
- Pro: the least operational work; deploys from git.
- Con: no Malaysian region (nearest is typically Singapore, with some only in the US or EU), so data leaves Malaysia; the pieces are spread across vendors.

### D. DigitalOcean Singapore (Droplet or App Platform + Managed PostgreSQL + Spaces)
- Pro: cheap, simple, managed DB backups, S3-compatible Spaces, low latency to Malaysia.
- Con: data stored in Singapore, so cross-border transfer obligations apply.

## Decision
Option B, with D as the fallback if the residency check concludes that storing data in Singapore is acceptable and cost matters more.

Rules that hold whichever option is chosen:
- **Object storage via the S3 API.** Every option above is S3-compatible, so the backend uses the AWS S3 SDK directly, with the endpoint and bucket set by environment configuration. There is no custom storage abstraction beyond one small module.
- **Private by default.** Buckets are private. Uploads and downloads of tenant files use short-lived pre-signed URLs issued only after server-side permission, entitlement and tenant checks. Object keys are prefixed `org/{organisationId}/…` and generated server-side, never from client-supplied paths.
- **Public assets separated.** Public profile assets (logo, cover) live under a separate public prefix or bucket. Finance evidence is never stored there.
- **Safe uploads.** The server enforces a content-type allow-list, a size limit and a server-generated filename. Content is never served as HTML from the application origin.
- **Same-site domains.** Frontend and API sit under the same registrable domain (e.g. `app.example.my` and `api.example.my`) so ADR-009's SameSite refresh cookie works.
- **Repeatable deployment.** Deployment is defined in the repository (Dockerfile, CI workflow and infrastructure notes or scripts), and secrets live in the platform secret store, never in git.
- **No Redis, queues or multi-instance setup** until measurements justify them (SYSTEM_ARCHITECTURE).

## Consequence
- Phase 05 and Phase 08 use the S3 module against a local S3-compatible service in development (e.g. MinIO in docker-compose).
- Phase 12 adds a Dockerfile, a deploy workflow, a backup and restore runbook with one tested restore, and monitoring (uptime check plus error logging without secrets).
- Open questions: the exact upload size limit and allowed file types; whether malware scanning is required; backup RPO/RTO targets; the retention period for deleted or archived tenant data. The specs give none of these.
