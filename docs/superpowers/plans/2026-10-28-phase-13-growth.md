# Phase 13 (Growth) Readiness and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. **Nothing below may be implemented until the product owner approves this plan and the decisions in §3 are recorded as ADRs.**

**Goal:** Turn Phase 13 ("prepare approved post-MVP roadmap") into a prioritised, buildable scope. Build only what is already approved (ADR-029 erasure/retention, ADR-030 consented support access).

**Spec:** `implementation-roadmap/PHASE_13_GROWTH.md`, ADR-004, ADR-016 §4, ADR-029, ADR-030, `product/LEGACY_FEATURE_DISPOSITION.md`.

## 1. Readiness check

Branch `feature/phase-13-growth`, cut from `feature/frontend-screens` (c95e2bf). Not pushed.

| Gate | Result |
|---|---|
| ADR-029, ADR-030 status | **Accepted 2026-10-26 by the product owner**, including the ⚠ items as written. Not drafts. |
| Uncommitted files | `ADR-029`, `ADR-030`, ADR-016/026 edits and the `REQUIREMENTS_TRACEABILITY.md` edits (OQ-15/19/20) are another session's work. They are untouched and unstaged. Someone must commit them before this branch is merged, or the plan's references dangle. |
| Phase 13 roadmap file | Generic boilerplate. The real scope comes from ADR-029, ADR-030, ADR-004 and the legacy disposition. Acceptance is only "roadmap prioritises customer/revenue value". |
| Cross-check | Phase 12 is done. Platform audit (`PlatformAuditLog`), `requirePlatformAdmin`, `audit()`/`platformAudit()`, notifications (ADR-017), the subscription provider seam (`transitionSubscription`, ADR-018 §5) and BM/EN (ADR-027) all exist. |

### Candidate items

| # | Item | Status | Requirement IDs | Buildable now? |
|---|---|---|---|---|
| A | Data retention and erasure (user and organisation; opt-in encrypted archive) | ADR-029 Accepted | OQ-15; new `PDPA-xx` IDs (below); touches FIN-011, FIN-015, AUTH-007, SEC-002, SEC-003, TENANT-* (isolation), NOTIF-004, LOC-* | **Yes**, after the mechanics ADR (§3 Q1–Q4, Q6) |
| B | Consented read-only support access | ADR-030 Accepted | OQ-19; RBAC-012 (amend), AUTH-008, SAAS-007 (entitlement still applies), NOTIF-004 | **Yes**, after the mechanics ADR (§3 Q5) |
| C | Online SaaS subscription payments (platform billing, not donations) | Seam exists (SAAS-010, ADR-018 §5); no provider, no spec | SAAS-001, SAAS-009, SAAS-010; SAAS-011 is MVP-only | **No.** Needs a provider decision and a new ADR. Highest direct revenue value. |
| D | Online donations | ADR-004: "Coming Soon/Post-MVP". No spec, provider or accounting rules | FIN-006, SAAS-011, SAAS-001 (platform billing stays separate from org finance) | **No.** ADR-004 does not authorise building. It needs a superseding ADR first. |
| E | Products/services; advanced chat | `KEEP_LATER_PHASE` (one line, no spec) | none yet | **No.** Needs a product spec. |
| F | Advanced marketplace | `REQUIRES_REDESIGN` | none | No. |
| G | Member invitations | **Closed**: direct add is permanent (ADR-016 §4, OQ-20) | ORG-003 | Out. Drop it from the Phase 13 list. |
| H | Email/push notification channels | NOTIF-002 says "future channels"; unassigned | NOTIF-002 | Not approved. Listed only as a later growth candidate. |

New requirement IDs to add to the traceability table (main session only): `PDPA-001` erasure is the default; `PDPA-002` retention is opt-in, max 7 years, encrypted archive; `PDPA-003` the erasure request is logged without the deleted data; `SUP-001` support access needs per-request owner consent; `SUP-002` it is read-only and time-boxed; `SUP-003` it is audited and visible to the owner.

## 2. Spec conflicts and gaps found

1. **ADR-029 vs FIN-011/FIN-015 and RUNBOOK §5.** The runbook says "Never delete finance records or audit logs", and FIN-015 is enforced by DB trigger `audit_log_append_only`. ADR-029 §1/§6 says organisation deletion removes finance data. ADR-029 wins by authority order, but it does not say it supersedes FIN-011/FIN-015, and the trigger has no bypass.
2. **Schema blockers.** `AuditLog.organisation` is `onDelete: Restrict` (31 Restrict/Cascade rules across schemas). The owner-is-member constraint triggers block deleting an owner or their membership.
3. **Backups.** Nightly dumps are kept 7 days (ADR-026). Erased data survives in them. ADR-029 is silent on this.
4. **Key custody.** ADR-029 §5 says "platform secret store". The stack (ADR-026) has only `.env` and GitHub secrets. There is no KMS.
5. **Approval.** ADR-029 §7 logs "who approved", but never says who approves. It does not mention a grace period, re-authentication or whether other members are told.
6. **User erasure when the user owns an organisation.** The owner assumption in ADR-016 holds one owner per organisation, so this case is unspecified.
7. **ADR-030 flow.** It does not say who starts a request (support or owner), how the owner picks the named admin, or what "read-only" means technically given there is no platform UI (Phase 04 is API-only).
8. **Permission keys.** New keys are added only by amending ADR-015 (23 tenant and 4 platform keys). Both A and B need keys.

## 3. Open questions (ask first, then record as ADRs)

| Q | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **Scope and order of Phase 13** | (a) A and B only; C/D/E stay roadmap. (b) A, B, then C (online SaaS payments). (c) Also D. | **(a)** now, then decide C separately. A and B are approved and are legal/trust items. C needs a provider ADR. D is blocked by ADR-004. |
| Q2 | **Finance records on erasure (conflict 1)** | (a) ADR-031 states that an owner-requested organisation erasure is the one permitted exception to FIN-011/FIN-015. The DB trigger allows delete only inside the erasure transaction (`SET LOCAL app.erasure = 'on'`), and platform audit rows record that erasure ran. (b) Never hard-delete; only anonymise. | **(a)**, as ADR-029 §1 already says. Add a short note to FIN-011 and the runbook. |
| Q3 | **Who approves, and the safety net (conflicts 5, 6)** | (a) Owner requests with password re-entry, a 7-day cancellable grace period, no platform approval; all members notified. A user who owns an organisation must delete or transfer it first. (b) Owner request plus platform-admin approval. (c) Immediate. | **(a)**: self-service, no platform access to tenant data, and a grace period protects against hijacked sessions. "Approved by" = the requester, once the grace period has elapsed. |
| Q4 | **Archive and key custody (conflicts 3, 4)** | (a) AES-256-GCM per-organisation data key, stored as an env secret / GitHub `production` secret, archive blob in the private Space; backups age out in 7 days and the completion message says so. (b) External KMS (new vendor). | **(a)**. A key lives in secret config, never in the database. Destroying it at expiry counts as destruction (ADR-029 §5). Revisit a KMS if volume grows. |
| Q5 | **Support access flow (conflicts 7, 8)** | (a) Platform admin files a request (reason, named admin = themselves); owner approves in app (1 h, extendable, revocable). Read-only means a guard that lets the named admin through tenant `GET` routes only while a grant is active. Entitlement gates still apply. New platform key `platform.support.access`. Minimal admin screen. (b) Owner initiates a grant to a named admin. | **(a)**. It reuses the existing guards and audit, and the minimal screen is needed for the admin to use it at all. |
| Q6 | **Retention choices** (ADR-029 ⚠4) | Confirm 1/3/5/7 years; the default when the owner picks none is immediate erasure. | Confirm as proposed. |
| Q7 | **Legal check** | Malaysian record-keeping rules for bank/finance records may require longer retention than erasure-on-request allows. | Ask the product owner to confirm with counsel before building A. This is not a spec change, just a risk flag. |

## 4. Proposed scope, order and parallelism

**Phase 0, main session, Opus (docs only, no migrations):**
- Record Q1–Q7 as ADR-031 (erasure mechanics) and ADR-032 (support access mechanics), plus the ADR-015 amendment for new permission keys.
- Update traceability (main session only).

**Phase 1, two parallel Sonnet module agents.** Each owns its own dirs and schema file. They create no migration; one migration is written at merge.

| Agent | Owns | Touches outside its dirs |
|---|---|---|
| **13A erasure** | `backend/src/modules/erasure/`, `frontend/src/features/erasure/`, `backend/prisma/schema/erasure.prisma` | Read-only use of the other schemas. Retention setting is a table in `erasure.prisma` (no edit to `tenancy.prisma`). Route mounting line in the app router. |
| **13B support** | `backend/src/modules/support/`, `frontend/src/features/support/`, `backend/prisma/schema/support.prisma` | Tenant guard (`tenancy/tenant.ts`) gets a small hook. One platform permission key. Route mounting line. |

Shared-file risks to merge by hand: the app router file, `permissions.ts`, the notifications event list (ADR-017), and the i18n strings.

**Phase 2, merge (main session):** merge one branch at a time. After the first, write the single migration (including the hand-written trigger changes). Run both full suites after each merge, and confirm DB tests ran, not skipped.

**Phase 3, Opus verification:** `security-reviewer` and `database-reviewer` on both modules. Check acceptance, then update traceability.

## Global Constraints

- Every tenant-owned query is tenant-scoped. Never trust tenant IDs, roles or plans from the frontend.
- Permissions and entitlements stay separate. Support access does not bypass the entitlement gate.
- Platform billing and organisation finance stay separate (SAAS-001). Online donations are **not** implemented (ADR-004). No payment processing.
- Server-side validation. Schema changes only via committed Prisma migrations (SEC-009), one at merge.
- No secrets in logs or the repo. Never commit `.env`. Work on feature branches; commit only, no push, no PR.
- DB tests need `DATABASE_URL`: start Postgres, run `npx prisma migrate deploy`, and confirm the DB tests ran.
- Implementation subagents on Sonnet; Opus for ADRs, planning and verification.

## Review Focus

1. A tenant table added later is missed by erasure. Expect a test that fails when any Prisma model with `organisationId` is not in the erasure registry.
2. A failure halfway through erasure. Expect rollback of the whole transaction with no partial deletion, and a `FAILED` request that can be retried.
3. A support grant that is expired, revoked, for another organisation, for another admin, or used on a write route. Expect 403 each time.
4. A platform admin with no grant. Expect the existing tenant guard still denies them.
5. Erasing while the owner is also a member of another organisation. Expect the other memberships and data to be untouched.

## Tasks (13A erasure — after Phase 0)

### Task A1: Schema and request lifecycle
**Files:** create `backend/prisma/schema/erasure.prisma`, `backend/src/modules/erasure/erasure.service.ts`, `erasure.routes.ts`, `erasure.db.test.ts`.
**Produces:** `ErasureRequest` (kind `USER|ORGANISATION`, status `PENDING_GRACE|CANCELLED|RUNNING|COMPLETED|FAILED`, `executeAfter`, no FK to the subject), `RetentionSetting` (`organisationId` unique, `years` in 1/3/5/7), `ArchiveRecord` (`organisationId`, `storageKey`, `destroyAfter`, `destroyedAt`). Requests carry no deleted data (PDPA-003).
- [ ] Failing tests: owner (password re-entry) creates a request; a non-owner gets 403; a tenant-B owner cannot read A's request; cancel within grace; `years: 2` is rejected (400).
- [ ] Implement `requestOrganisationErasure`, `cancelErasure`, `setRetention`. Run the tests to see them fail first, then pass.
- [ ] Commit.

### Task A2: Erasure executor
**Files:** `backend/src/modules/erasure/executor.ts`, `registry.ts`, test file.
**Consumes:** A1 models. **Produces:** `runDueErasures(now: Date): Promise<void>`, `registry: string[]` (ordered table list).
- [ ] Failing tests: the registry-completeness test (Review Focus 1); a seeded organisation with finance, hub, ops, files and members is fully removed while another organisation is untouched; a thrown error rolls back (Review Focus 2); erasing an owner who is a member elsewhere leaves that membership alone (Review Focus 5).
- [ ] Implement in one transaction using `SET LOCAL app.erasure = 'on'`. Handle the owner-is-member triggers and the `Restrict` FKs. This needs hand-written SQL, deferred to the merge migration, so the agent's test DB applies it locally.
- [ ] Delete files from the Space, then drop CloudFront-cached public objects. Commit.

### Task A3: Archive and key destruction
**Files:** `archive.ts`, test. **Produces:** `archiveOrganisation(orgId): Promise<ArchiveRecord>`, `destroyExpiredArchives(now): Promise<number>`.
- [ ] Failing tests: the archive round-trips only with the key; a wrong key fails GCM auth; expiry deletes the blob and the key reference (`destroyedAt` set); no retention setting means no archive.
- [ ] Implement with Node `crypto` (AES-256-GCM, 32-byte per-org key from the secret store). Commit.

### Task A4: User erasure
**Files:** `user-erasure.ts`, test.
- [ ] Failing tests: an owner of an organisation is blocked with a clear error; otherwise the name and email are replaced with `deleted-<id>@invalid`, refresh tokens are removed, memberships are removed through the audited flow, and finance and audit rows keep working with a blanked reference.
- [ ] Implement. Commit.

### Task A5: Notifications, scheduler and runbook
- [ ] Notify owner and members at request, cancel and completion (ADR-017 events). Tests in the notifications style.
- [ ] Wire `runDueErasures` and `destroyExpiredArchives` into the existing scheduler/cron approach. Update `docs/operations/RUNBOOK.md` §5 (main session approves the doc edit). Commit.

### Task A6: Frontend (`frontend/src/features/erasure/`)
- [ ] Settings screens: retention choice, request organisation deletion (with password), pending/cancel state, and account deletion. BM/EN strings per ADR-027. Mobile-first, 44px targets (ADR-028). Component tests for the validation and cancel paths. Commit.

## Tasks (13B support access — after Phase 0)

### Task B1: Grant model and request flow
**Files:** `backend/prisma/schema/support.prisma`, `backend/src/modules/support/support.service.ts`, `support.routes.ts`, `support.db.test.ts`.
**Produces:** `SupportAccessGrant` (`organisationId`, `adminUserId`, `reason`, `status REQUESTED|GRANTED|DENIED|REVOKED|EXPIRED`, `grantedAt`, `expiresAt`).
- [ ] Failing tests: admin files a request with a reason (400 if empty); only the owner can approve, deny, extend or revoke; the default duration is 1 hour; the tenant-B owner cannot see A's requests.
- [ ] Implement. Commit.

### Task B2: Guard
**Files:** modify `backend/src/modules/tenancy/tenant.ts` (minimal hook), create `support/guard.ts`, test.
- [ ] Failing tests: Review Focus 3 and 4 (expired, revoked, other org, other admin, non-GET are all denied; no grant is denied). A valid grant allows `GET` only, and the entitlement gate is still applied.
- [ ] Implement `supportGrantFor(userId, organisationId, now)` and the guard. Write a `platformAudit()` row for each grant, access and end. Commit.

### Task B3: Owner visibility, notifications and the admin screen
- [ ] Owner endpoint listing the audit rows filtered by `targetOrganisationId`. Notify the owner at start and end (ADR-017). Minimal frontend: owner approve/revoke screen and a platform-admin request screen, BM/EN. Commit.

## Merge and verification task (main session)

- [ ] Merge 13A, then 13B. After each: write the single migration, `npx prisma migrate deploy`, run the full backend and frontend suites, and confirm the DB tests ran, not skipped.
- [ ] Opus review: `security-reviewer`, `database-reviewer`, tenant isolation check, acceptance check. Update `REQUIREMENTS_TRACEABILITY.md` (main session only).

## Self-review

- Coverage: ADR-029 §1–7 map to A1–A5; ADR-030 §1–7 map to B1–B3, with §7 archive access explicitly **not built** (no process designed; ADR-029 §3 needs a later ADR before anyone can open an archive).
- Proportion: kept to the decisions an implementer cannot make alone; test bodies are left to the executor.
- The plan does not touch C/D/E/F; those stay on the roadmap and each needs its own ADR first.
