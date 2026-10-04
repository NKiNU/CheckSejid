# CLAUDE.md — Masyarakat SaaS

## Mandatory workflow
1. Read this file.
2. Read `PROJECT_INDEX.md`.
3. Read the relevant implementation phase.
4. Read all required specifications.
5. Inspect existing code before duplicating patterns.

## Non-negotiable rules
- Every tenant-owned query is tenant-scoped.
- Never trust tenant IDs, roles, plans or permissions supplied only by the frontend.
- Permissions and subscription entitlements are separate.
- Organisation finance and Masyarakat SaaS billing are separate domains.
- Do not implement Online Donations in MVP.
- Do not hard-code Masjid-only assumptions into generic organisation modules.
- Validate server-side.
- Do not silently change approved specifications.

## Definition of done
Requirements covered, security/tenant rules considered, validation and error handling present, relevant tests pass, acceptance criteria checked, and approved documentation updated.

If specifications are unclear, do not guess: identify the ambiguity and propose options.
