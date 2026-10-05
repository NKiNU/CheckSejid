# Implementation Roadmap

Phases are sequential unless dependency review approves otherwise. Each phase requires reading its documents, mapping requirements, planning, implementation, security/tenant review, tests and acceptance verification.

## Approved execution order (dependency review, approved by the user 2026-10-05)

```
00 → 01 → 02 → 03 → 04 → 10 Notifications → 11 Subscriptions → {05, 06, 07, 08, 09 in parallel} → 12 → 13
```

Phase files keep their original numbers. Only the execution order changes.

Rationale: Notifications (10) defines the domain-event contract (NOTIF-001, NOTIF-004), and Subscriptions (11) provides the central entitlement gate (SAAS-007, RBAC-004). Modules 05–09 call into both, so both shared services must exist before the modules are built. Phases 01–04 are the sequential critical path.

Decision gates before the parallel wave: ADR-012 (prayer-time provider, Phase 09) and ADR-013 (finance self-approval, Phase 08) must be Accepted. ADR-014 (hosting and object storage) must be Accepted for its object-storage rules before Phases 05 and 08, and in full before Phase 12.

## Parallel-work rules (Phases 05–09)

1. **Schema:** one Prisma schema file per module at `backend/prisma/schema/<module>.prisma` (Prisma multi-file schema). The switch from the single `backend/prisma/schema.prisma` to the `schema/` folder must happen before the parallel wave starts.
2. **Migrations:** agents do not create migrations in parallel phases. The integrator generates one migration at merge time.
3. **Code ownership:** each module owns `backend/src/modules/<module>/` and `frontend/src/features/<module>/` and does not edit another module's folders. Changes to shared code go through the integrator.
4. **Permission keys** are defined in Phase 03. Parallel phases use them and do not invent new keys without integrator review.
5. **Traceability:** `docs/REQUIREMENTS_TRACEABILITY.md` has a single writer, the integrator. Phase agents report requirement IDs and tests and do not edit the file.
6. **Test database:** each worktree uses its own test database.
7. **Merging:** the integrator merges phases one at a time and runs the full test suite after each merge.
