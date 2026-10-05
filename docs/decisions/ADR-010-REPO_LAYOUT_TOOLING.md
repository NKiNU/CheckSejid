# ADR-010-REPO_LAYOUT_TOOLING

## Status
Accepted

## Decision
TypeScript throughout, in two independent folders:
- `frontend/`: React + Vite + TypeScript.
- `backend/`: Node.js + Express + TypeScript + Prisma.

Tooling: npm, oxlint (lint) + `tsc` (type check), Vitest (both folders), Supertest for API tests, Playwright for end-to-end tests, and zod for runtime validation. Local PostgreSQL runs via docker-compose. CI (GitHub Actions) runs lint and tests for both folders. Prisma is pinned to the stable 7.x line (npm `latest` pointed at an 8.0 RC on 2026-10-04). A formatter (e.g. Prettier) is deferred until needed.

There is no shared package. Permission and entitlement keys are defined in the backend and exposed to the frontend through the API; frontend types for API payloads are maintained in `frontend/`.

## Consequence
Each folder has `dev`, `test` and `lint` scripts. Environment variables are documented in `.env.example` files, and real `.env` files are git-ignored.
