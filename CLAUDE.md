# CLAUDE.md — CheckSejid / Masyarakat SaaS

The source of truth is `docs/`. Its rules are loaded below and must be followed.

@docs/CLAUDE.md
@docs/SOURCE_OF_TRUTH.md

## Stack decisions (see ADRs)
- Database: PostgreSQL + Prisma — `docs/decisions/ADR-008-DATABASE_POSTGRES_PRISMA.md`
- Auth: JWT access + rotating refresh tokens — `docs/decisions/ADR-009-AUTH_JWT.md`
- Layout/tooling: TypeScript, `frontend/` (React + Vite) and `backend/` (Express) — `docs/decisions/ADR-010-REPO_LAYOUT_TOOLING.md`
- Money: integer minor units + currency — `docs/decisions/ADR-011-MONEY_REPRESENTATION.md`
- Organisation onboarding/lifecycle rules — `docs/decisions/ADR-016-ORGANISATION_ONBOARDING_LIFECYCLE.md`
- Notification recipients/content — `docs/decisions/ADR-017-NOTIFICATION_RECIPIENTS.md`
- Subscriptions, trial and entitlement gate — `docs/decisions/ADR-018-SUBSCRIPTIONS_TRIAL_ENTITLEMENTS.md`
- Public visibility and following — `docs/decisions/ADR-019-PUBLIC_VISIBILITY_AND_FOLLOWING.md`
- File uploads (types, sizes, content checks) — `docs/decisions/ADR-020-FILE_UPLOADS.md`
- Information hub lifecycle and events — `docs/decisions/ADR-021-INFORMATION_HUB.md`
- Finance state machine, void requests, budgets, collections — `docs/decisions/ADR-022-FINANCE_STATE_MACHINE_AND_SCOPE.md`
- Prayer times location, Hijri, Qibla — `docs/decisions/ADR-023-ISLAMIC_FEATURES_LOCATION_HIJRI_QIBLA.md`
- Operations defaults (Proposed) — `docs/decisions/ADR-024-OPERATIONS_DEFAULTS.md`

## Workflow
Work phases in order from `docs/implementation-roadmap/`. For each phase: read the required docs → map requirement IDs → plan → TDD → security/tenant review → verify acceptance criteria → update `docs/REQUIREMENTS_TRACEABILITY.md`.
