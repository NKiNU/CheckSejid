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

## Workflow
Work phases in order from `docs/implementation-roadmap/`. For each phase: read the required docs → map requirement IDs → plan → TDD → security/tenant review → verify acceptance criteria → update `docs/REQUIREMENTS_TRACEABILITY.md`.

## Working agreements (product owner)
- **Phase order (approved 2026-10-05):** 00 → 01 → 02 → 03 → 04 → 10 → 11 → {05, 06, 07, 08, 09 in parallel} → 12 → 13. Done: 00–04, 10, 11.
- **Before a phase starts**, raise its open questions (`OQ-xx` in `docs/REQUIREMENTS_TRACEABILITY.md`) with options and a recommendation; get an explicit OK, then record the answer as an ADR. Phase 05 needs OQ-10; Phase 08 needs OQ-06..09.
- **Parallel phases:** each module owns `backend/src/modules/<m>/` and `frontend/src/features/<m>/` and its own `backend/prisma/schema/<m>.prisma`; parallel agents create no migrations (one migration at merge); only the main session edits `REQUIREMENTS_TRACEABILITY.md`; a separate test database per agent; merge one branch at a time, running the full test suites after each.
- **Style:** ponytail (minimum code that works, no speculative scaffolding). Plan first; docs/ADRs before code. Don't re-propose a monorepo, shared package or session cookies (ADR-008..011).
- **Toolkit:** superpowers for process (brainstorming, plans, TDD, verification), ECC for domain skills and reviewers (prisma, postgres, api-design, react, security-reviewer, database-reviewer), context7 for library docs, playwright for E2E. No unrelated ECC packs (multi-model, GAN, marketing).
- **Models:** implementation subagents on Sonnet; Opus for readiness checks, ADRs, planning and verification.
- **Tests:** DB tests are skipped silently without `DATABASE_URL`. Start Postgres, `npx prisma migrate deploy`, and confirm the tests ran, not skipped. Never commit `.env`. Push work to a feature branch, never directly to `develop`/`main`.
