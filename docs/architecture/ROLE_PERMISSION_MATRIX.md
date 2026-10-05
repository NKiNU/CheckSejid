# Role and Permission Model

Initial roles: owner, admin, treasurer, committee, staff. Roles are collections of permissions. Example permissions: organisation.read/update, bulletin.publish, event.manage, operations.manage, finance.income.create, finance.expense.create, finance.approve, finance.audit.read. Sensitive permissions are enforced server-side.

The full permission-key catalogue, the role × permission matrix and the Platform Administrator model are defined in `decisions/ADR-015-DEFAULT_ROLES_AND_PERMISSIONS.md` (Accepted).
