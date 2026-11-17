# Masyarakat web

React + Vite + TypeScript + Tailwind v4 frontend for the community app and the organisation workspace.
Design: `docs/product/UI_DESIGN.md`; bulletin-first decision: `docs/decisions/ADR-008-BULLETIN_FIRST_COMMUNITY.md`.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest + coverage (domain rules, 80% floor)
npm run lint
npm run typecheck
npm run build
```

## What is real and what is seeded
- `src/domain/` holds the business rules as pure, tested functions: financial state machine (no self-approval, locked records, audit entries), money in integer sen, bulletin lifecycle and feed rules (HUB-001..005), discovery visibility, RBAC, plan entitlements, Hijri formatting, next prayer, Qibla bearing.
- `src/data/seed.ts` is in-memory sample data. There is no backend yet, so changes reset on reload (follows and language are kept in the browser). Prayer times are sample values until a provider is connected (Phase 09).
- The workspace has a "Preview as role" switch under the organisation name so you can see what each role can do. It is a demo control; real permissions will be enforced on the server.

## Routes
Community: `/` (bulletin), `/discover`, `/o/:slug`, `/prayer`, `/me`.
Workspace: `/workspace`, `/workspace/bulletin`, `/workspace/finance`; other sections show "Not built yet" with their roadmap phase.
