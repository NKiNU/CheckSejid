# ADR-030-CONSENTED_SUPPORT_ACCESS

## Status
Accepted (2026-10-26) by the product owner, including the items marked ⚠ as written. Closes OQ-19. Amends ADR-015 §5 (no break-glass in MVP).

## Context
Support cannot diagnose tenant problems without seeing tenant data, but platform administrators must not read it freely (ADR-015 §5).

## Decision (product owner, 2026-10-26)
1. **Support may enter an organisation's data only with the owner's consent.**
2. ⚠ **Consent is per request:** the owner grants it in the app for a stated reason. No standing consent.
3. ⚠ **Read-only and time-boxed** (proposed 1 hour, owner can extend or revoke at any time). Support cannot change tenant data.
4. ⚠ **Named person:** access is tied to one platform admin account, not shared.
5. **Audited:** each grant, each access and its end are written to a platform audit log that the owner can see.
6. The owner is notified when access starts and ends (ADR-017).
7. Archived data from ADR-029 is not covered by this grant; opening it needs its own explicit consent.

## Consequence
- Needs: a consent request/grant record, a time-limited platform-admin scope check in the server (separate from permissions and entitlements), an audit log and a UI for the owner. The tenant guard keeps denying platform admins by default.
- ⚠ If the owner is unreachable (e.g. account locked), there is no override. Decide whether that is acceptable.
