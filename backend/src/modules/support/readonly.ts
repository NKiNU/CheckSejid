// ADR-032 §4: a support session's permission set is read-only and is not derived from membership.
// Pure (no imports) so rbac.ts can use it without an import cycle. An explicit allow-list, not a name
// pattern: a new "*.read" key must be added here deliberately (readonly.test.ts forces the decision).
const READ_ONLY = new Set(["organisation.read", "members.read", "operations.read", "finance.read", "finance.audit.read", "billing.read"]);
export const supportCan = (key: string) => READ_ONLY.has(key);
