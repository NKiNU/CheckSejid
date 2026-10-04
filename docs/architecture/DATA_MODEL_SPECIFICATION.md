# Data Model Specification

Global: User, platform configuration.
Tenant: Organisation, OrganisationMembership, Subscription, information hub records, operational records, FinancialCategory, Income, Expense, Collection, Budget, Approval and Audit records.

Tenant records normally include organisation ownership and timestamps. Cross-tenant references must be rejected. Approved/auditable financial records are not silently hard-deleted.
