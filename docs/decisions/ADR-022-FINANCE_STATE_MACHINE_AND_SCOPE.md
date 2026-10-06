# ADR-022-FINANCE_STATE_MACHINE_AND_SCOPE

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-06, OQ-07, OQ-08 and OQ-09. §8 lists implementer defaults that the product owner has not yet confirmed. Reverse any of them by amending this ADR.

## Context
- `finance/FINANCIAL_STATE_MACHINE.md`: "DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED. PENDING_APPROVAL → REJECTED. Permitted earlier states may → VOIDED. Transitions are explicit and permission-checked. Invalid transitions are rejected. Approved records are not silently edited/deleted; corrections are auditable."
- `finance/FINANCIAL_APPROVALS.md`, `finance/FINANCIAL_AUDIT_LOGS.md`, `finance/BUDGETING.md`, `finance/COLLECTION_MANAGEMENT.md`, `finance/INCOME_MANAGEMENT.md`, `finance/EXPENSE_MANAGEMENT.md`.
- ADR-011 (money), ADR-013 (self-approval), ADR-015 §1 (finance keys), ADR-017 (notifications), ADR-018 (`finance`, `finance.reporting` entitlements).

Product-owner answers (2026-10-06), using the example of a treasurer and a chairperson:
- **OQ-06a:** the treasurer submits and the chairperson approves. To void an approved record, the treasurer opens it and **requests a void with a reason**. The chairperson **approves the void request**. Then a new record may be submitted.
- **OQ-06a follow-up:** a record not yet approved (draft, or waiting for approval) can be **cancelled directly with a reason**; only voiding an APPROVED record needs approval.
- **OQ-06b:** REJECTED stays rejected for good. A "Copy to new draft" action makes a fresh copy to fix and resubmit.
- **OQ-07:** income and expenses need approval. Moving money from savings into a budget needs approval. Collection money needs approval. "With these approvals we are clear on the money movement and spending."
- **OQ-08:** a budget's "used" amount counts approved expenses only.
- **OQ-09:** a collection has an optional target. Progress is the total of approved income linked to it.

## Decision

### 1. Which records use the state machine (OQ-07)
| Record | State machine | Create/edit/submit key | Approve key |
|---|---|---|---|
| Income | yes | `finance.income.create` | `finance.approve` |
| Expense | yes | `finance.expense.create` | `finance.approve` |
| Budget (an allocation of money to a purpose and period) | yes | `finance.budget.manage` | `finance.approve` |
| Collection | no: a purpose container (OPEN/CLOSED); its money arrives as Income records linked to it, which are approved | `finance.collection.manage` | n/a |
| Financial category | no: reference data | `finance.category.manage` | n/a |

"Savings" is not modelled as an account balance in MVP (no spec defines accounts). Approving a budget is the recorded, audited decision to allocate the money.

### 2. States and transitions (OQ-06)
| From → To | Action | Who | Reason |
|---|---|---|---|
| (new) → DRAFT | create | create key for the record type | — |
| DRAFT → SUBMITTED → PENDING_APPROVAL | submit (one action, both steps audited) | the record's creator, holding the create key | — |
| PENDING_APPROVAL → APPROVED | approve | `finance.approve`, subject to ADR-013 | optional |
| PENDING_APPROVAL → REJECTED | reject | `finance.approve` | optional |
| DRAFT / PENDING_APPROVAL → VOIDED | void directly ("cancel") | the record's creator holding the create key, or `finance.void` | **required** |
| APPROVED → (void requested) | request void | `finance.void` | **required** |
| APPROVED (void requested) → VOIDED | approve void request | `finance.approve`, subject to ADR-013 (requester = void requester) | optional |
| APPROVED (void requested) → APPROVED | reject void request | `finance.approve` | optional |

- SUBMITTED is passed through inside the submit action, so it is never a resting state.
- REJECTED and VOIDED are terminal. A pending void request does not change the state: the record stays APPROVED, and counts as approved, until the void is approved.
- Every other transition returns `409 INVALID_STATE_TRANSITION`. Transitions are conditional updates on the current state (and void-request flag), so concurrent actions cannot both win.

### 3. Corrections (OQ-06b)
- No record is edited after DRAFT, and no record is hard-deleted (FIN-011).
- **Copy to new draft:** for a REJECTED or VOIDED record, `POST …/:id/copy` creates a new DRAFT with the same fields and `copiedFromId` pointing at the original. It needs the create key for the record type. The original is unchanged.
- An approved mistake is corrected by: request void → void approved → copy to new draft (or create a new record) → submit → approve. Every step is audited.

### 4. Approvals and audit (FIN-012..015)
- Every approval decision (approve, reject, approve void, reject void) writes a `FinanceApproval` row: record type and id, decision, actor, timestamp, optional reason, and `selfApproved` (ADR-013).
- Every action writes an `AuditLog` row with action `finance.<type>.<action>`, actor, target, and before/after state, in the same transaction.
- `AuditLog` rows cannot be updated or deleted: a database trigger rejects it, and no API writes them (FIN-015). `finance.audit.read` lists only `finance.*` audit rows.
- Submitting a record or requesting a void notifies members with `finance.approval_required` (ADR-017). The title names the record type only, never amounts.

### 5. Budget "used" (OQ-08)
For a budget with category C and period [start, end]: used = the sum of APPROVED expenses (a pending void still counts; VOIDED does not) in category C dated within the period, in the budget's currency. Remaining = planned − used. Computed on read and never stored (FIN-008: source transactions are not modified). Budgets and this report require the `finance.reporting` entitlement (ADR-018).

### 6. Collection progress (OQ-09)
A collection has `purpose`, an optional `targetAmount` (minor units), a currency and status OPEN/CLOSED. Progress = the sum of APPROVED income linked to it (same void rule as §5), shown against the target when one is set. Income can be linked only to an OPEN collection of the same organisation and currency. No online payments (ADR-004, SAAS-011).

### 7. Money (FIN-001/002)
Amounts are positive integer minor units (BIGINT), at most 10^13, with an ISO 4217 currency (default MYR, ADR-011). Totals are computed in PostgreSQL (`SUM` over BIGINT) and are tenant-scoped (TENANT-007). The API returns minor units as JSON integers.

### 8. Implementer defaults (not yet confirmed by the product owner)
- Only the creator edits or submits their own DRAFT. Others with `finance.void` can cancel it.
- A record's category must belong to the same organisation, be active, and match the record's kind (income categories for income; expense categories for expenses and budgets).
- Lists are bounded and keyset-paginated (SEC-006).

## Consequence
- `finance/FINANCIAL_STATE_MACHINE.md` is extended to name the void-request path, and ADR-015's `finance.void` row is clarified (keys unchanged).
- Phase 08 implements this. New requirement IDs: FIN-018 (void request flow), FIN-019 (copy to new draft), FIN-020 (budget used), FIN-021 (collection progress).
