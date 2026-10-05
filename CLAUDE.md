# CLAUDE.md — CheckSejid / Masyarakat SaaS

The source of truth is `docs/`. Its rules are loaded below and must be followed.

@docs/CLAUDE.md
@docs/SOURCE_OF_TRUTH.md

## Stack decisions (see ADRs)
- Database: PostgreSQL + Prisma — `docs/decisions/ADR-008-DATABASE_POSTGRES_PRISMA.md`
- Auth: JWT access + rotating refresh tokens — `docs/decisions/ADR-009-AUTH_JWT.md`
- Layout/tooling: TypeScript, `frontend/` (React + Vite) and `backend/` (Express) — `docs/decisions/ADR-010-REPO_LAYOUT_TOOLING.md`
- Money: integer minor units + currency — `docs/decisions/ADR-011-MONEY_REPRESENTATION.md`

## Workflow
Work phases in order from `docs/implementation-roadmap/`. For each phase: read the required docs → map requirement IDs → plan → TDD → security/tenant review → verify acceptance criteria → update `docs/REQUIREMENTS_TRACEABILITY.md`.
