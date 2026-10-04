# Tenant Data Isolation

Enforcement: authenticate actor → determine authorised organisation context → tenant-scope service/repository query → validate referenced entities belong to same tenant.

Required tests: A cannot read/update/delete B; foreign IDs cannot be attached; reports/aggregations remain tenant-scoped.
