# ADR-013-FINANCE_SELF_APPROVAL

## Status
Accepted (2026-10-05) by the product owner, with the recommended option.

## Context
Spec lines that drive this decision:
- `finance/FINANCIAL_APPROVALS.md`: "Approval requires authorised actor, valid state transition, timestamp, decision and optional reason. Where policy prohibits self-approval, server-side rules enforce it. Future configurable policies require explicit design."
- `finance/FINANCIAL_GOVERNANCE.md`: "Goals: traceability, clear responsibility, controlled approvals and evidence where required. Avoid building a generic enterprise workflow engine unless justified."
- `finance/FINANCIAL_STATE_MACHINE.md`: "DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED. PENDING_APPROVAL → REJECTED … Transitions are explicit and permission-checked."
- `finance/FINANCIAL_AUDIT_LOGS.md`: approval and rejection are audited with actor, action, target and timestamp.
- `architecture/ROLE_PERMISSION_MATRIX.md`: roles include owner, admin and treasurer, and `finance.approve` is a permission.
- `product/MVP_SCOPE.md`: generic enterprise workflow engine excluded.

The specs say self-approval may be prohibited "where policy prohibits", but they never state the policy. Many small organisations have one treasurer, or a single person who is both owner and treasurer. A strict prohibition would stop them from approving anything.

Definition used below: the **requester** of a financial record is its creator and, if different, the user who submitted it.

## Options

### A. Always prohibit self-approval
The approver must hold `finance.approve` and must not be the requester.
- Pro: simplest rule, strongest segregation of duties, trivially testable.
- Con: an organisation with only one person holding `finance.approve` cannot approve that person's own records. A one-person organisation cannot approve anything.

### B. Always allow self-approval (audited)
- Pro: never blocks anyone.
- Con: approval becomes a formality, which defeats "controlled approvals". Weak governance.

### C. Prohibit by default, with an automatic sole-approver exception (recommended)
Self-approval is rejected unless the requester is the only active member of the organisation who holds `finance.approve` at the time of approval. When the exception applies, the approval succeeds and is recorded with a `selfApproved = true` flag in the approval record and the audit log. Self-approved records are visibly marked in finance lists and reports.
- Pro: governance holds by default as soon as a second approver exists, while small organisations are not blocked and every exception is visible. No per-organisation configuration, so no workflow engine.
- Con: the server must count approvers at approval time, so a race with role changes is possible (acceptable, because the outcome is audited). An owner could remove other approvers to unlock self-approval, but role changes are themselves auditable.

### D. Per-organisation configurable setting (owner toggles "allow self-approval")
- Pro: flexible.
- Con: this is the "future configurable policy" that `FINANCIAL_APPROVALS.md` says needs explicit design. It adds settings UI, permission questions (who may change the toggle) and possible plan-gating questions. Over-scoped for MVP.

## Decision
Option C for MVP.
- Enforcement happens server-side in the finance approval service, never only in the UI (AUTH-003).
- The approver count is tenant-scoped and counts active memberships whose roles grant `finance.approve`.
- Rejection follows the same rule as approval. If a requester may not approve, they may not reject either. Withdrawing a record is a separate action and is not covered here.
- The error for a blocked self-approval is a predictable, specific error code (API_STANDARDS) so the UI can explain why.

## Consequence
- Tests cover: blocked self-approval when another approver exists; allowed and flagged self-approval when the requester is the sole approver; flag present in the audit entry; cross-tenant approvers are not counted.
- Phase 03 must define which default roles hold `finance.approve`. The current role spec does not say.
- A later ADR may introduce Option D, for example for Professional plans under "governance". Until then, no per-organisation approval settings.
