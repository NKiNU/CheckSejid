# ADR-031-ERASURE_MECHANICS

## Status
Accepted (2026-10-28) by the product owner, who adopted the recommended option for every question. Implements ADR-029. Q7 (legal check) stays open as a risk, not a blocker for design.

## Context
ADR-029 settles what erasure and retention mean. It leaves the mechanics open, and some of them conflict with existing rules: FIN-011/FIN-015 and RUNBOOK §5 say finance and audit records are never deleted; `audit_log_append_only` is a DB trigger; `AuditLog.organisation` is `onDelete: Restrict`; the owner-is-member triggers block removing an owner; backups keep 7 days (ADR-026); there is no secret store beyond `.env` and GitHub `production` secrets.

## Decision
1. **Finance exception.** An organisation erasure carried out under ADR-029 is the one permitted exception to FIN-011 and FIN-015. The append-only trigger allows deletes only when the transaction has run `SET LOCAL app.erasure = 'on'`, which only the erasure executor does. Every other path stays blocked. A `PlatformAuditLog` row records that the erasure ran, with the organisation id and no deleted content (ADR-029 §7). RUNBOOK §5 is updated to match when this is built.
2. **Request flow.** Only the owner can request organisation erasure, and only the user themselves can request their own account erasure. The request needs the password again. It waits 7 days (`PENDING_GRACE`) and can be cancelled in that time. No platform approval is needed, and platform admins gain no access to tenant data. "Approved by" in the log is the requester, recorded once the grace period elapses. Owner and all members are notified at request, cancel and completion (ADR-017).
3. **User who owns an organisation.** Account erasure is refused until they delete the organisation or hand it over. Other memberships of that user are removed through the normal audited flow.
4. **User erasure result.** Name and email become `deleted-<id>@invalid`, refresh tokens are deleted, and the row is kept so history that references it still works (as in RUNBOOK §5). Organisation records the owner retains keep working with a blanked user reference.
5. **Executor.** One transaction. An ordered table registry lists every tenant table. A test fails if any Prisma model with `organisationId` is missing from it, so new modules cannot be forgotten. A failure rolls back everything and marks the request `FAILED`; it can be retried. Files in the Spaces are deleted and cached public objects invalidated after the commit.
6. **Archive and keys.** Retention is chosen by the owner from 1, 3, 5 or 7 years. With no choice, erasure is immediate and nothing is kept. The archive is AES-256-GCM encrypted with a 32-byte per-organisation key held in the production secret configuration, never in the database. The blob goes to the private Space. At expiry the blob is deleted and the key is destroyed. Opening an archive is not built. It needs its own ADR and the consent in ADR-030 §7.
7. **Backups.** Erased data remains in nightly dumps until they age out (7 days). Erasure is therefore complete within 7 days of the run, and the completion message says so. Restoring a backup must replay completed erasure requests (runbook step).
8. **Permissions.** No new tenant permission key. Erasure and retention use owner-only checks like `organisation.archive`, and a lapsed or suspended organisation can still request erasure (an entitlement does not block a legal right).
9. **Schema.** Everything lives in `erasure.prisma`: `ErasureRequest`, `RetentionSetting`, `ArchiveRecord`. `tenancy.prisma` is not edited.

## Consequence
- Needs one hand-written migration for the trigger change and the `Restrict` foreign keys, written once at merge.
- ⚠ Open risk (Q7): Malaysian record-keeping rules for finance records may require longer retention than erasure on request allows. The product owner should confirm with counsel before this is released to customers.
- The traceability table gains `PDPA-001..003`; FIN-011 gets a note pointing here.
