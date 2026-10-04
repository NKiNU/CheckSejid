# Multi-Tenancy

**TENANT-001:** Every organisation is a logical tenant.
**TENANT-002:** Tenant-owned records belong to exactly one organisation unless explicitly documented otherwise.
**TENANT-003:** Server-side authorisation determines accessible tenant context.
**TENANT-004:** Client-supplied organisation IDs are identifiers, not proof of access.

All tenant-owned queries, reports and aggregations must be organisation-scoped.
