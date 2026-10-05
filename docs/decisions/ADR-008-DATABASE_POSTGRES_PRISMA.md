# ADR-008-DATABASE_POSTGRES_PRISMA

## Status
Accepted

## Decision
Persistence uses PostgreSQL accessed through Prisma ORM. Schema changes are made only through Prisma migrations committed to git.

Tenant isolation (TENANT-001..004) is enforced in the backend by a tenant-scoped repository/service layer: the organisation context is resolved server-side from the authenticated actor and applied to every tenant-owned query, and referenced entities are checked to belong to the same tenant. PostgreSQL row-level security may be added later as defence in depth, but it is not the primary mechanism.

## Consequence
- Every tenant-owned model has a required `organisationId` and timestamps.
- Repository/service functions for tenant data take the server-resolved tenant context; raw unscoped queries on tenant tables are not permitted outside reviewed code.
- Cross-tenant tests (per `architecture/TENANT_DATA_ISOLATION.md`) run against a real PostgreSQL instance.
