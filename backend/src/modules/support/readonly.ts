// ADR-032 §4: a support session's permission set is read-only and is not derived from membership.
// Pure (no imports) so rbac.ts can use it without an import cycle. Read keys only; the ADR-015 catalogue
// names every read key "*.read".
export const supportCan = (key: string) => key.endsWith(".read");
