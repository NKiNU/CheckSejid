# ADR-032-SUPPORT_ACCESS_MECHANICS

## Status
Accepted (2026-10-28) by the product owner, who adopted the recommended option. Implements ADR-030 and amends ADR-015 §5 (one new platform key).

## Context
ADR-030 says support may enter an organisation's data only with the owner's consent, read-only, time-boxed, tied to one named admin and audited. It does not say who starts a request, what read-only means in code, or where it is shown, and platform endpoints have no UI (Phase 04).

## Decision
1. **Request.** A platform admin files a request for one organisation with a required reason. The named admin is the requester. The owner is notified (ADR-017).
2. **Grant.** Only the owner can approve, deny, extend or revoke. Approval starts a 1 hour window. Extending adds up to 1 hour per action. No standing consent, and a grant is never reused for another request.
3. **Read-only means a guard, not a role.** While a grant is `GRANTED` and not expired, the named admin passes the tenant guard for `GET` routes of that organisation only. Every other method, organisation, admin or time is denied (403). Without a grant the existing guard still denies platform admins.
4. **Entitlements still apply.** The entitlement gate runs as usual (permissions and entitlements stay separate). The admin's effective permission set is read-only and is not derived from membership.
5. **Audit.** Each request, grant, access (one row per request made) and end is written to `PlatformAuditLog` with `targetOrganisationId` and the reason. The owner reads the rows for their organisation through an owner endpoint. Owners are notified when access starts and ends.
6. **New platform key.** `platform.support.access` is added to ADR-015 §5 (requesting access). It does not read tenant data by itself. The grant does.
7. **UI.** A minimal platform-admin screen to file requests and see status, and an owner screen to approve, revoke and view the access log. BM/EN (ADR-027).
8. **Unreachable owner.** No override, as accepted in ADR-030. Archived data is outside this grant (ADR-030 §7) and its opening process is not built.

## Consequence
- Owner approval is a hard dependency, so support cannot help organisations whose owner cannot be reached. That is accepted.
- Schema in `support.prisma`: `SupportAccessGrant` only. Audit reuses `PlatformAuditLog`.
- One small hook in `tenancy/tenant.ts`; traceability gains `SUP-001..003`.
