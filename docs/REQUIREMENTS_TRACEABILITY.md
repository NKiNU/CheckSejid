# Requirements Traceability

Prefixes: AUTH, ORG, TENANT, RBAC, PUB, HUB, OPS, FIN, ISL, NOTIF, SAAS, plus SEC (security/API baseline) and LOC (localisation), added 2026-10-05. Every implementation phase identifies applicable requirement IDs and verification tests.

Rules:
- IDs are stable. Never renumber or reuse an ID. Retire an ID by marking it `Withdrawn` with a reason.
- IDs defined inline in a spec (e.g. TENANT-001 in `saas/MULTI_TENANCY.md`) keep that spec as their source of truth. This table only indexes them.
- "Phase" is the phase that must deliver and test the requirement. "All" means a cross-cutting rule that every phase must keep satisfying.
- "Tests" is filled in by the integrator when a phase merges. This file has a single writer during parallel phases (see `implementation-roadmap/README.md`).
- Source paths are relative to `docs/`.

## Identity and security

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| AUTH-001 | Passwords are securely hashed (argon2id per ADR-009). | architecture/SECURITY_ARCHITECTURE.md; ADR-009 | 01 | `identity.db.test.ts` › register (argon2id hash, never returned) |
| AUTH-002 | Protected endpoints require authentication. | architecture/SECURITY_ARCHITECTURE.md | 01 | `auth.test.ts` › requireAuth (GET /me); `identity.db.test.ts` › protected access |
| AUTH-003 | Authorisation is independent of frontend visibility. | architecture/SECURITY_ARCHITECTURE.md | 01, All | `auth.test.ts` › access token carries only the user id; 03: `rbac.db.test.ts` › a role change takes effect on the next request |
| AUTH-004 | Login and refresh endpoints are rate limited. | ADR-009; architecture/SECURITY_ARCHITECTURE.md | 01 | `auth.test.ts` › rate limiting; `trust-proxy.test.ts` |
| AUTH-005 | Access tokens are short-lived (~15 min) Bearer tokens held in frontend memory, not localStorage. Refresh tokens are opaque values in an httpOnly, Secure, SameSite cookie scoped to the refresh endpoint, and only their hash is stored. | ADR-009 | 01 | `auth.test.ts` › tokens; `identity.db.test.ts` › cookie flags; `frontend/src/features/identity/api.test.ts` |
| AUTH-006 | A refresh token is rotated on every use. Reuse of a rotated token revokes the whole token family. | ADR-009 | 01 | `identity.db.test.ts` › refresh rotation (incl. reuse + concurrent refresh) |
| AUTH-007 | Logout and password change revoke refresh tokens. | ADR-009 | 01 | Partial (01): logout covered by `identity.db.test.ts` › logout (incl. in-flight rotation race, Postgres-only). Password change not built yet. |
| AUTH-008 | Tokens identify the user only. Organisation context, roles and permissions are resolved server-side per request and never taken from client-supplied claims. | ADR-009; CLAUDE.md | 01, 02 | 01 part: `auth.test.ts` (token = `sub` only). 02: `tenancy.db.test.ts` › requireTenant resolves membership from DB per request. |
| SEC-001 | All input is validated server-side. | CLAUDE.md; architecture/SECURITY_ARCHITECTURE.md; architecture/API_STANDARDS.md | All | 01: `auth.test.ts` › validation (server-side) |
| SEC-002 | Secrets come from environment/secret configuration and are never committed. | architecture/SECURITY_ARCHITECTURE.md; ADR-009; PHASE_00 acceptance | 00, 12 | |
| SEC-003 | Logs never contain secrets (passwords, tokens, signing keys). | architecture/SECURITY_ARCHITECTURE.md | 01, 12 | |
| SEC-004 | API responses never expose secrets (e.g. password or token hashes). | architecture/API_STANDARDS.md | 01, All | 01: `identity.db.test.ts` › register (never returns the hash) |
| SEC-005 | Errors are predictable and consistent across the API. | architecture/API_STANDARDS.md | 00, All | 01: `errors.ts` envelope `{error:{code,message,details?}}`; `auth.test.ts` |
| SEC-006 | List endpoints use bounded pagination and filtering. | architecture/API_STANDARDS.md | All | 05–09: keyset pagination on discovery/hub/finance lists, validated bounds (`public.db.test.ts` › keyset pagination is bounded and validated); other module lists hard-capped (ponytail notes) |
| SEC-007 | File uploads are safe (ADR-014 + ADR-020: content-sniffed allow-list, size limits, server-generated keys, private evidence with short-lived pre-signed downloads). | architecture/SECURITY_ARCHITECTURE.md; finance/EXPENSE_MANAGEMENT.md | 05, 08 | ADR-020 (Accepted): `public.db.test.ts` › rejects wrong types by content (415), oversize (413); `finance.db.test.ts` › evidence attachments; `uploads.test.ts`. Malware scanning deferred to Phase 12 (ADR-020 §1) |
| SEC-008 | Dependencies are maintained (e.g. automated audit in CI). | architecture/SECURITY_ARCHITECTURE.md | 12 | |
| SEC-009 | Schema changes are made only through committed Prisma migrations. | ADR-008 | All | |

## Tenancy and organisation

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| TENANT-001 | Every organisation is a logical tenant. | saas/MULTI_TENANCY.md | 02 | `tenancy.db.test.ts` › creates the organisation and the creator's membership atomically |
| TENANT-002 | Tenant-owned records belong to exactly one organisation unless explicitly documented otherwise. | saas/MULTI_TENANCY.md | 02 | `tenancy.db.test.ts` › injects organisationId on create (forTenant) |
| TENANT-003 | Server-side authorisation determines the accessible tenant context. | saas/MULTI_TENANCY.md | 02 | `tenancy.db.test.ts` › lists only my organisations; membership checked on every request (removed member loses access) |
| TENANT-004 | Client-supplied organisation IDs are identifiers, not proof of access. | saas/MULTI_TENANCY.md | 02 | `tenancy.db.test.ts` › client organisationId/userId in body rejected; unknown/malformed/foreign org ids → same 404 |
| TENANT-005 | Tenant A cannot read, update or delete tenant B's records. | architecture/TENANT_DATA_ISOLATION.md | 02, All | `tenancy.db.test.ts` › another tenant gets 401/404 on every tenant route (`src/test/cross-tenant.ts` helper, error-code + snapshot checks); forTenant: global models unreachable, raw/$transaction absent, where tricks cannot widen scope, include/relation select throw; 05–09: cross-tenant checks in `public.db.test.ts`, `hub.db.test.ts`, `operations.db.test.ts`, `finance.db.test.ts` (foreign org and ID guessing under own org, with snapshots) |
| TENANT-006 | Foreign-tenant IDs cannot be attached. Referenced entities must belong to the same tenant, and cross-tenant references are rejected. | architecture/TENANT_DATA_ISOLATION.md; architecture/DATA_MODEL_SPECIFICATION.md | 02, All | `tenancy.db.test.ts` › relation writes (connect, nested create) throw; foreign organisationId in create/createMany/update/upsert throws; 07: `operations.db.test.ts` › cannot attach the victim's programme or members; 08: `finance.db.test.ts` › categories/collections of another org rejected (composite FKs on category/collection/attachment) |
| TENANT-007 | Reports and aggregations remain tenant-scoped. | architecture/TENANT_DATA_ISOLATION.md; saas/MULTI_TENANCY.md | 02, 08, All | Partial (02): `tenancy.db.test.ts` › forTenant scopes count/aggregate/groupBy. Report coverage in Phase 08.; 08: `finance.db.test.ts` › lists and aggregates stay tenant-scoped; collection progress and budget used computed via forTenant |
| TENANT-008 | Tenant-owned models have a required `organisationId` and timestamps. | architecture/DATA_MODEL_SPECIFICATION.md; ADR-008 | 02, All | Migration `20261005071133_tenancy`; forTenant only exposes models with an `organisationId` field |
| ORG-001 | Organisation creation creates the organisation and the owner membership as one coherent (atomic) workflow. | saas/ORGANISATION_ACCOUNT_MODEL.md; PHASE_04 acceptance | 02, 04 | `tenancy.db.test.ts` › creates the organisation and the creator's membership atomically (built in 02); 04: create → DRAFT (`onboarding.db.test.ts`) |
| ORG-002 | MVP: a management user/account actively manages one organisation. | ADR-006; saas/ORGANISATION_ACCOUNT_MODEL.md | 02, 04 | Partial (02): `tenancy.db.test.ts` › a user can own only one organisation (`Organisation.ownerId @unique`); 04: OQ-13 settled by ADR-016 §4 (own ≤1, member of many) |
| ORG-003 | An organisation can have authorised staff/committee memberships in addition to the owner. | saas/ORGANISATION_ACCOUNT_MODEL.md | 02 | Partial (02): `tenancy.db.test.ts` › owner adds an existing user; duplicate rejected; non-owner cannot add. Invite flow TBD. |
| ORG-004 | Organisation lifecycle: DRAFT → ONBOARDING → ACTIVE; ACTIVE → SUSPENDED; SUSPENDED → ACTIVE (reinstate); ACTIVE/SUSPENDED → ARCHIVED. Other transitions are rejected. | saas/LIFECYCLE_STATE_MACHINE.md | 04 | `onboarding.db.test.ts` › ORG-008 onboarding transitions; platform routes › suspend → reinstate → archive; invalid transitions 409 (Migration `20261005142400_onboarding`) |
| ORG-005 | The organisation profile supports name, logo, cover, description, type, contacts, location and links. | modules/organisation/ORGANISATION_PROFILE.md | 04, 05 | Partial (04, ADR-016 §3): `onboarding.db.test.ts` › PATCH stores links and profile fields; validation (strict body, http(s) links, ISO-2 country, required fields not clearable). Logo/cover → 05.; 05: logo/cover (`public.db.test.ts` › stores a sniffed image under the public prefix, replaces and removes it, audited) |
| ORG-006 | Organisation visibility is one of Public, Private, Unlisted. | README.md; modules/organisation/ORGANISATION_PROFILE.md | 05 | `public.db.test.ts` › visibility setting (defaults to PRIVATE; organisation.update only; validated). Migration `20261006045234_phases_05_09` |
| ORG-008 | Organisation transitions follow ADR-016 §1 (create → DRAFT; first profile save → ONBOARDING; complete onboarding needs name, type, state, country; platform suspend/reinstate/archive with reason; owner archive); others return 409 and every transition is audited. | ADR-016 | 04 | `onboarding.db.test.ts` › ORG-008 onboarding transitions (incl. concurrent double transition: exactly one wins); tenant archive; platform routes (audited with reason) |
| ORG-009 | One lifecycle guard, separate from permissions and entitlements: SUSPENDED/ARCHIVED block tenant writes (except leave, and archive while SUSPENDED); module routes require ACTIVE; only ACTIVE organisations are ever public. | ADR-016 §2 | 04, 05–08 | 04: `onboarding.db.test.ts` › ORG-009 lifecycle guard (SUSPENDED/ARCHIVED reject every tenant write, reads + leave allowed; re-checked under the row lock; route list cannot drift; requireActiveOrg admits only ACTIVE); 05: only ACTIVE orgs are public (`public.db.test.ts` › not ACTIVE → 404); 06–08: module writes need ACTIVE, reads allowed while SUSPENDED/ARCHIVED (`hub.db.test.ts`, `operations.db.test.ts`, `finance.db.test.ts` › lifecycle guard) |
| ORG-007 | Generic organisation modules do not hard-code Masjid-only assumptions (e.g. organisation type, job titles). | CLAUDE.md; modules/islamic-features/ISLAMIC_FEATURES_OVERVIEW.md | All | 06–09: free-text duty (OPS-004), generic org types in discovery; Islamic features isolated in their own module (ISL-001) |

## Roles and permissions

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| RBAC-001 | Initial roles: owner, admin, treasurer, committee, staff. | architecture/ROLE_PERMISSION_MATRIX.md | 03 | `permissions.test.ts` › the five fixed roles |
| RBAC-002 | Roles are collections of permissions. Checks are made against permission keys (e.g. `finance.approve`), not role names. | architecture/ROLE_PERMISSION_MATRIX.md | 03 | `permissions.test.ts` › each role holds exactly the ADR-015 §2 keys (parsed from the ADR at test time) |
| RBAC-003 | Sensitive actions are denied server-side without the required permission. | architecture/ROLE_PERMISSION_MATRIX.md; PHASE_03 acceptance | 03, All | `rbac.db.test.ts` › permission matrix on routes (6 routes × 5 roles) |
| RBAC-004 | Permissions and subscription entitlements are separate checks, and both may be required. | saas/FEATURE_ENTITLEMENTS.md; CLAUDE.md | 03, 11 | Seam (03): `requirePermission` never reads plan/subscription. 11: `requireEntitlement` chained after it; `subscriptions.db.test.ts` › missing permission → FORBIDDEN, missing entitlement → ENTITLEMENT_REQUIRED; members.max → QUOTA_EXCEEDED (incl. concurrent adds under the org lock) |
| RBAC-005 | Permission keys are defined in the backend and exposed to the frontend through the API. | ADR-010 | 03 | `rbac.db.test.ts` › GET /orgs/:orgId/me/permissions |
| RBAC-006 | Platform administration is separate from tenant financial authority. | product/USER_PERSONAS.md | 03 | `permissions.test.ts` › platform keys held by no tenant role; `rbac.db.test.ts` › Platform Administrator has no tenant access |
| RBAC-007 | The permission-key catalogue in ADR-015 is canonical; keys are added only by amending ADR-015. | ADR-015 | 03, All | `permissions.test.ts` › exactly the 23 tenant keys; `rbac.db.test.ts` › every mutating /orgs/:orgId route declares a permission |
| RBAC-008 | Exactly one owner per organisation; ownership changes only by atomic, audited transfer. | ADR-015 §6 | 03 | `rbac.db.test.ts` › single owner; ownership transfer (incl. concurrent transfers); DB trigger `rbac_owner_is_member` |
| RBAC-009 | No self-escalation: nobody changes their own roles, and an actor grants only roles whose permissions they hold. | ADR-015 §6 | 03 | `rbac.db.test.ts` › no self-escalation; `permissions.test.ts` › subset rule |
| RBAC-010 | Permission checks fail closed (unknown key, missing or foreign membership → deny). | ADR-015 §6 | 03, All | `rbac.db.test.ts` › role in org A grants nothing in org B; member with no roles cannot read; composite FK; `permissions.test.ts` › unknown roles grant nothing |
| RBAC-011 | Every role change is audited (actor, target, before/after, timestamp). | ADR-015 §6; ADR-013 | 03 | `rbac.db.test.ts` › audit rows on grant/remove/leave/transfer |
| RBAC-012 | Platform Administrator is a DB flag set only out of band; it holds no tenant permissions and has no tenant data access in MVP; platform actions are audited. | ADR-015 §5 | 03, 04, 11 | `rbac.db.test.ts` › Platform Administrator (guard re-reads flag; CLI grant/revoke with required reason; refused for accounts with memberships; not settable via API); 04: `onboarding.db.test.ts` › platform routes (non-admin 403; metadata-only paginated list; suspend/reinstate/archive audited with reason); 11: `subscriptions.db.test.ts` › only a Platform Administrator may transition; audit rows with reason and details; list shows subscription state |
| RBAC-013 | A non-owner member may leave an organisation; the owner must transfer ownership first. | ADR-015 §6 rule 7 | 03 | `rbac.db.test.ts` › any non-owner may leave; the owner cannot leave |
| RBAC-014 | `finance.approve` is held by owner and treasurer only. | ADR-015 §2 (confirmed by product owner) | 03, 08 | `permissions.test.ts` › finance.approve is held by owner and treasurer only |

## Public platform and discovery

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| PUB-001 | Community users can discover Public organisations. | modules/community/COMMUNITY_AND_DISCOVERY.md | 05 | `public.db.test.ts` › lists only PUBLIC + ACTIVE organisations |
| PUB-002 | Discovery supports keyword/name, organisation type and location filters. | modules/community/COMMUNITY_AND_DISCOVERY.md | 05 | `public.db.test.ts` › keyword, type, state and country filters |
| PUB-003 | Public organisations are discoverable and viewable. Private organisations are not public. Unlisted organisations are excluded from normal discovery. | modules/organisation/ORGANISATION_PROFILE.md | 05 | `public.db.test.ts` › PUBLIC: anyone; UNLISTED: logged-in only; PRIVATE / not ACTIVE / unknown: the same 404 (ADR-019) |
| PUB-004 | Internal finance and management data is never public. | modules/organisation/ORGANISATION_PROFILE.md | 05, 08 | 05: `public.db.test.ts` › public listing exposes profile fields only; 08: finance routes are tenant-only (no public finance endpoint) |
| PUB-005 | Community users may follow multiple organisations. | README.md; ADR-002 | 05 | `public.db.test.ts` › follow PUBLIC orgs (idempotent, many) |
| PUB-006 | Following is separate from management membership and grants no management access. | ADR-002; ADR-006; modules/community/COMMUNITY_AND_DISCOVERY.md | 05 | `public.db.test.ts` › … grants no management access (no membership, tenant routes 404) |
| PUB-007 | Visibility rules: PUBLIC discoverable and viewable by anyone; UNLISTED only by logged-in users with the link (anonymous 401 LOGIN_REQUIRED); PRIVATE internal only; follow PUBLIC only; follows of non-public orgs hidden but kept. | ADR-019 | 05 | `public.db.test.ts` › profile page; following (hidden, kept, back; NOT_FOLLOWABLE for UNLISTED) |

## Information hub

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| HUB-001 | The hub provides announcements/bulletin posts and events. | modules/information-hub/INFORMATION_HUB.md | 06 | `hub.db.test.ts` (posts and events) |
| HUB-002 | Content lifecycle: DRAFT → PUBLISHED → ARCHIVED, and ARCHIVED → PUBLISHED (republish, ADR-021). | modules/information-hub/INFORMATION_HUB.md | 06 | `hub.db.test.ts` › DRAFT → PUBLISHED → ARCHIVED → PUBLISHED; invalid transitions 409 |
| HUB-003 | Only authorised users manage tenant content (e.g. `bulletin.publish`, `event.manage`). | modules/information-hub/INFORMATION_HUB.md; architecture/ROLE_PERMISSION_MATRIX.md | 06 | `hub.db.test.ts` › staff cannot publish (403); treasurer cannot create (403) |
| HUB-004 | Drafts are not public. | modules/information-hub/INFORMATION_HUB.md | 06 | `hub.db.test.ts` › drafts are visible only with the *.manage key; public reads show PUBLISHED only |
| HUB-005 | Publication respects organisation visibility. | modules/information-hub/INFORMATION_HUB.md | 06 | `hub.db.test.ts` › public reads respect organisation visibility (PRIVATE 404, UNLISTED login required); follower feed |
| HUB-006 | Events have title, description, startsAt/endsAt (UTC, endsAt ≥ startsAt) and optional location; publishing an event notifies members (event.published). | ADR-021 | 06 | `hub.db.test.ts` › validation (event times, incl. patch against stored times); publishing (and republishing) an event notifies every other member |

## Operations

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| OPS-001 | Planning records programmes with objectives, dates and status. | modules/operations/OPERATIONS.md | 07 | `operations.db.test.ts` › programmes |
| OPS-002 | Tasks support assignment, due date and status. | modules/operations/OPERATIONS.md | 07 | `operations.db.test.ts` › tasks: assignment to members only, notified; the assignee may change only the status |
| OPS-003 | Roster supports flexible people/time assignments. | modules/operations/OPERATIONS.md | 07 | `operations.db.test.ts` › roster |
| OPS-004 | Operations models do not hard-code Masjid-specific job titles. | modules/operations/OPERATIONS.md | 07 | Free-text `duty` (no enum); `operations.db.test.ts` › roster uses "Imam (Subuh)"/"Bilal" as data only |
| OPS-005 | Operations management is permission-checked (e.g. `operations.manage`). | architecture/ROLE_PERMISSION_MATRIX.md; PHASE_07 acceptance | 07 | `operations.db.test.ts` › entitlement, lifecycle and permission guards are separate; non-managers 403 |

## Finance

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| FIN-001 | Documented currency/precision strategy; no uncontrolled floating point for authoritative totals. Implemented by ADR-011: integer minor units (BIGINT) plus ISO 4217 currency, and the API accepts/returns minor units. Default currency MYR. | finance/MONEY_AND_AMOUNT_RULES.md; ADR-011 | 08 | `finance.db.test.ts` › validates amounts as positive integer minor units; totals use integer arithmetic (large amounts add up exactly); DB CHECK constraints |
| FIN-002 | Financial records require amount, currency, date, category and organisation ownership. | finance/MONEY_AND_AMOUNT_RULES.md | 08 | `finance.db.test.ts` › validation (amount, currency, date, category required; organisation stamped by forTenant) |
| FIN-003 | Income requires organisation, amount/currency, received date, category/source, description/reference, state and creator. | finance/INCOME_MANAGEMENT.md | 08 | `finance.db.test.ts` › collections (income with receivedOn, category, description, state, creator) |
| FIN-004 | Expense requires organisation, amount/currency, date, category, payee/vendor where applicable, description/reference and state. | finance/EXPENSE_MANAGEMENT.md | 08 | `finance.db.test.ts` › validation (description required; payee optional) |
| FIN-005 | Expense evidence attachments follow file security rules (SEC-007). | finance/EXPENSE_MANAGEMENT.md | 08 | `finance.db.test.ts` › evidence attachments (creator, DRAFT only, content/size checked, private pre-signed download, max 5) |
| FIN-006 | Collections record purpose and progress. No online payment processing. | finance/COLLECTION_MANAGEMENT.md; ADR-004 | 08 | `finance.db.test.ts` › collections (FIN-021) |
| FIN-007 | A budget records organisation, period/purpose, planned amount, category and status. | finance/BUDGETING.md | 08 | `finance.db.test.ts` › budgets go through approval |
| FIN-008 | Budget reporting compares planned against actual without modifying source transactions. | finance/BUDGETING.md | 08 | `finance.db.test.ts` › budgets (source expenses unchanged by the report) |
| FIN-009 | Financial state machine: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED; PENDING_APPROVAL → REJECTED; DRAFT/PENDING_APPROVAL → VOIDED directly with a reason; APPROVED → VOIDED only via an approved void request (ADR-022). | finance/FINANCIAL_STATE_MACHINE.md | 08 | `finance.db.test.ts` › state machine (ADR-022 §2) |
| FIN-010 | Transitions are explicit and permission-checked. Invalid transitions are rejected. | finance/FINANCIAL_STATE_MACHINE.md | 08 | `finance.db.test.ts` › invalid transitions are rejected with 409; two approvers at once: exactly one wins |
| FIN-011 | Approved/auditable records are not silently edited or hard-deleted. Corrections are auditable. | finance/FINANCIAL_STATE_MACHINE.md; architecture/DATA_MODEL_SPECIFICATION.md | 08 | `finance.db.test.ts` › edits after DRAFT 409; no delete endpoint for records; corrections via void + copy |
| FIN-012 | An approval records the authorised actor, timestamp, decision and optional reason. | finance/FINANCIAL_APPROVALS.md | 08 | `finance.db.test.ts` › FinanceApproval rows (decision, actor, reason, selfApproved, timestamp) |
| FIN-013 | Where policy prohibits self-approval, the server enforces it (policy: ADR-013, Accepted). | finance/FINANCIAL_APPROVALS.md | 08 | `finance.db.test.ts` › self-approval (blocked while another approver exists; sole approver allowed and flagged) |
| FIN-014 | Creation, submission, approval, rejection, void and material correction are audited with actor, action, target, timestamp and before/after context. | finance/FINANCIAL_AUDIT_LOGS.md | 08 | `finance.db.test.ts` › audit rows for create/submit/pending_approval/approve/void_request/void_approve with before/after |
| FIN-015 | Ordinary users cannot modify protected audit history. | finance/FINANCIAL_AUDIT_LOGS.md | 08 | `finance.db.test.ts` › the log cannot be updated or deleted (DB trigger `audit_log_append_only`); no write API |
| FIN-016 | Finance actions are gated by finance permissions (e.g. `finance.income.create`, `finance.expense.create`, `finance.approve`, `finance.audit.read`). | architecture/ROLE_PERMISSION_MATRIX.md | 08 | `finance.db.test.ts` › finance keys gate every action; only the creator edits or submits their draft |
| FIN-017 | The product does not claim legal/accounting certification. | ADR-003; finance/FINANCIAL_OVERVIEW.md | 08 | UI copy in `FinancePanel.tsx` states records are not certified accounting |
| FIN-018 | An APPROVED record is voided only by a void request (finance.void, reason required) approved under finance.approve (ADR-013 applies); a rejected request leaves it APPROVED. | ADR-022 §2 | 08 | `finance.db.test.ts` › void request → void approved; a rejected void request leaves the record APPROVED |
| FIN-019 | REJECTED and VOIDED are terminal; "copy to new draft" creates a linked DRAFT (copiedFromId). | ADR-022 §3 | 08 | `finance.db.test.ts` › … copy to new draft; reject is terminal |
| FIN-020 | Budget used = approved expenses (pending void still counts) in the budget's category, currency and period; remaining = planned − used; budgets need finance.reporting. | ADR-022 §5; ADR-018 | 08 | `finance.db.test.ts` › budgets |
| FIN-021 | Collection progress = approved linked income against an optional target; income links only to an OPEN collection in the same currency. | ADR-022 §6 | 08 | `finance.db.test.ts` › collections |

## Islamic features

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| ISL-001 | Prayer Times, Hijri Calendar and Qibla are modular capabilities that do not make generic organisation modules Masjid-only. | ADR-005; modules/islamic-features/ISLAMIC_FEATURES_OVERVIEW.md | 09 | Separate `islamic` module, no tenant data, no entitlement; `islamic.db.test.ts` |
| ISL-002 | Prayer times come from a documented source/provider strategy with location context, provenance and timezone awareness (ADR-012 + ADR-023: visitor zone → JAKIM e-Solat, visitor location → labelled calculation). | modules/islamic-features/PRAYER_TIMES.md | 09 | `islamic.db.test.ts` › zone: fetches the JAKIM year once … with provenance; coordinates only: labelled calculation |
| ISL-003 | Prayer times are not hard-coded. | modules/islamic-features/PRAYER_TIMES.md | 09 | `islamic.db.test.ts` › a different place gives different times |
| ISL-004 | External prayer-time data refresh and caching are explicit. | modules/islamic-features/PRAYER_TIMES.md | 09 | `islamic.db.test.ts` › caching per zone-year; refresh in December; failures logged and cache kept serving |
| ISL-005 | Hijri dates are shown alongside Gregorian dates where relevant, and both are clearly labelled. | modules/islamic-features/HIJRI_CALENDAR.md; architecture/LOCALISATION_AND_TIMEZONE.md | 09 | `islamic.db.test.ts` › Gregorian and Hijri labelled separately; Umm al-Qura computed |
| ISL-006 | Regional moon-sighting differences are not presented as universally authoritative. | modules/islamic-features/HIJRI_CALENDAR.md; PHASE_09 out of scope | 09 | Hijri label says local moon sighting may differ; UI says to follow the local religious authority |
| ISL-007 | Qibla is optional. When location is unavailable it says so instead of pretending precision. | modules/islamic-features/QIBLA.md | 09 | `islamic.db.test.ts` › no zone or location → LOCATION_REQUIRED; frontend `islamic/api.test.ts` › reports unavailable location honestly |

## Notifications

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| NOTIF-001 | Notifications originate from domain events. | architecture/NOTIFICATION_ARCHITECTURE.md | 10 | `notifications.db.test.ts` › member.added notifies every other member (emitted from `addMember`, first real event per ADR-017 §6). Migration `20261005152752_notifications` |
| NOTIF-002 | The MVP channel is in-app only. Email/push are future channels. | architecture/NOTIFICATION_ARCHITECTURE.md; modules/notifications/NOTIFICATIONS.md | 10 | In-app only: `Notification` table + `/me/notifications` API + `NotificationsPanel`; no email/push code (ADR-017 §3) |
| NOTIF-003 | In-app notification records have read/unread state. | modules/notifications/NOTIFICATIONS.md; PHASE_10 acceptance | 10 | `notifications.db.test.ts` › mark read is idempotent; unread filter and read-all; `frontend/src/features/notifications/api.test.ts` |
| NOTIF-004 | Domain events include task assignment, roster assignment, finance approval required, event publication and subscription changes. | architecture/NOTIFICATION_ARCHITECTURE.md | 10 (contract); 06, 07, 08, 11 (emit) | Partial (10, contract): `NotificationType` union in `notifications.service.ts` names all five events; emitters land in 06, 07, 08. 11 done: `subscriptions.db.test.ts` › every allowed transition … notified to every member (`subscription.changed`); 06: `hub.db.test.ts` (event.published); 07: `operations.db.test.ts` (task.assigned, roster.assigned); 08: `finance.db.test.ts` (finance.approval_required, no amounts) |
| NOTIF-006 | Recipients are the organisation's management members (all members except the actor); notifications hold only type, non-sensitive title and target reference; the inbox shows only organisations the user still belongs to. | ADR-017 | 10 | `notifications.db.test.ts` › not the actor; each user sees only their own (404 for others); removed/departed members no longer see the org; cross-tenant; title length guard; keyset pagination bounds |
| NOTIF-005 | A notification failure does not silently corrupt the originating transaction. | architecture/NOTIFICATION_ARCHITECTURE.md | 10 | `notifications.db.test.ts` › a failing notify rolls the member add back |

## SaaS subscriptions

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| SAAS-001 | Organisation financial records and platform billing are separate. | saas/SUBSCRIPTION_AND_BILLING.md | 08, 11 | Separate `subscriptions` module and `Plan`/`Subscription` tables (migration `20261006023413_subscriptions`); no amounts, no reference to or from finance (ADR-018 §6). Finance side: Phase 08.; 08: finance tables never reference Plan/Subscription (finance.prisma) |
| SAAS-002 | The subscription determines entitlements/limits. | saas/SUBSCRIPTION_AND_BILLING.md | 11 | `subscriptions.db.test.ts` › entitlement gate (trial allows; lapsed trial / CANCELLED → Free; PAST_DUE keeps the paid plan; activation restores; Starter lacks finance.reporting) |
| SAAS-003 | Trial duration is 30 days. | saas/SUBSCRIPTION_AND_BILLING.md | 11 | `subscriptions.db.test.ts` › a new organisation gets a 30-day Professional TRIAL in the same transaction; a lapsed trial reads as EXPIRED with Free entitlements |
| SAAS-004 | Plans are Free, Starter and Professional. | README.md; business/SUBSCRIPTION_PLANS.md | 11 | `subscriptions.db.test.ts` › plans are seeded as DB configuration (free, starter, professional) |
| SAAS-005 | Prices and quotas are commercial configuration, not hard-coded in business features. | business/SUBSCRIPTION_PLANS.md | 11 | `subscriptions.db.test.ts` › plans are seeded as DB configuration with exactly the catalogue keys (values live in `Plan.entitlements`, ADR-018 §1) |
| SAAS-006 | Entitlements may be boolean access or numeric quotas. | saas/FEATURE_ENTITLEMENTS.md | 11 | `subscriptions.db.test.ts` › entitlement gate (boolean features); members.max quota (numeric, null = unlimited) |
| SAAS-007 | Entitlement gating is centralised. No `plan === …` checks are scattered through modules. | saas/FEATURE_ENTITLEMENTS.md; PHASE_11 acceptance | 11, All | Central gate `subscriptions/entitlements.ts` (`requireEntitlement`, `assertQuota`); `subscriptions.db.test.ts` › guards declare their feature and reject unknown features. No plan-key checks outside it. |
| SAAS-008 | A subscription belongs to the organisation tenant. | saas/SUBSCRIPTION_AND_BILLING.md | 11 | `Subscription.organisationId @unique` (tenant-owned, read via forTenant); `subscriptions.db.test.ts` › cross-tenant: 404 for a foreign organisation; requires billing.read |
| SAAS-009 | Subscription lifecycle: TRIAL → ACTIVE/EXPIRED; ACTIVE → PAST_DUE/CANCELLED; PAST_DUE → ACTIVE/EXPIRED; EXPIRED/CANCELLED → ACTIVE (resubscribe, ADR-018 §4). Other transitions are rejected. | saas/LIFECYCLE_STATE_MACHINE.md; ADR-018 | 11 | `subscriptions.db.test.ts` › every allowed transition (incl. resubscribe, ADR-018 §4), audited and notified; disallowed transitions 409; reason/planKey validation; non-admin 403; concurrent transitions: exactly one wins |
| SAAS-010 | Internal subscription states are independent of provider-specific events. Any payment provider sits behind a provider abstraction. | saas/LIFECYCLE_STATE_MACHINE.md; saas/SUBSCRIPTION_AND_BILLING.md | 11 | Single transition function `transitionSubscription()` (ADR-018 §5); no provider in MVP (SAAS-011) |
| SAAS-011 | MVP implements no online payment processing, including online donations. | ADR-004; product/MVP_SCOPE.md | All | |

## Localisation

| ID | Requirement | Source | Phase | Tests |
|---|---|---|---|---|
| LOC-001 | The MVP UI supports Bahasa Melayu and English. | architecture/LOCALISATION_AND_TIMEZONE.md | Unassigned (see OQ-12) | |
| LOC-002 | The default context is Asia/Kuala_Lumpur timezone and MYR currency. | architecture/LOCALISATION_AND_TIMEZONE.md; finance/MONEY_AND_AMOUNT_RULES.md | 02, 08 | 08: currency defaults to MYR; 09: JAKIM times rendered in Asia/Kuala_Lumpur |
| LOC-003 | Timestamps are stored consistently (UTC) and rendered in context. | architecture/LOCALISATION_AND_TIMEZONE.md | All | 06–09: event/roster instants stored UTC; DATE fields as YYYY-MM-DD (`dates.ts`) |

## Open questions

These are implied by the specs but unclear. Do not implement a guess. Resolve each by a spec update or an ADR, then add or adjust requirement IDs.

| # | Question | Raised by | Blocks phase |
|---|---|---|---|
| OQ-01 | ~~Resolved by ADR-018 (Accepted 2026-10-06).~~ Which capabilities and quotas does each plan (Free/Starter/Professional) include? Are Islamic features and finance approvals available on every plan? | business/SUBSCRIPTION_PLANS.md, README.md | 11 |
| OQ-02 | ~~Resolved by ADR-018 (Accepted 2026-10-06).~~ Which plan level does the 30-day trial grant? What happens on EXPIRED or CANCELLED (downgrade to Free, read-only, suspension)? | saas/SUBSCRIPTION_AND_BILLING.md, saas/LIFECYCLE_STATE_MACHINE.md | 11 |
| OQ-03 | ~~Resolved by ADR-018 (Accepted 2026-10-06).~~ MVP excludes "online payment processing". How do paid plans get paid for and activated in MVP (manual invoice plus platform-admin activation?), and who triggers TRIAL → ACTIVE and ACTIVE → PAST_DUE? | product/MVP_SCOPE.md vs saas/LIFECYCLE_STATE_MACHINE.md | 11 |
| OQ-04 | ~~Default role → permission mapping and full key list.~~ **Resolved by ADR-015 (Accepted 2026-10-05).** | | |
| OQ-05 | ~~Platform Administrator powers.~~ **Resolved by ADR-015 §5 (Accepted 2026-10-05).** | | |
| OQ-06 | ~~Resolved by ADR-022 (Accepted 2026-10-06).~~ Finance states: what moves SUBMITTED → PENDING_APPROVAL (automatic or a separate action)? Which "earlier states" may be VOIDED? Can an APPROVED record be voided, and is a correction a reversal entry or an amendment? Is REJECTED terminal or does it return to DRAFT? | finance/FINANCIAL_STATE_MACHINE.md, finance/FINANCIAL_AUDIT_LOGS.md | 08 |
| OQ-07 | ~~Resolved by ADR-022 (Accepted 2026-10-06).~~ Do all income and expense records require approval? Do budgets and collections go through the same state machine? | finance/FINANCIAL_STATE_MACHINE.md, finance/BUDGETING.md, finance/COLLECTION_MANAGEMENT.md | 08 |
| OQ-08 | ~~Resolved by ADR-022 §5 (Accepted 2026-10-06).~~ Budget "actual": is it derived from APPROVED expenses (and income?) matched by category and period? | finance/BUDGETING.md | 08 |
| OQ-09 | ~~Resolved by ADR-022 §6 (Accepted 2026-10-06).~~ Collection "progress": is there a target amount? Is progress computed from linked income records? | finance/COLLECTION_MANAGEMENT.md | 08 |
| OQ-10 | ~~Resolved by ADR-019 (Accepted 2026-10-06).~~ Unlisted: is the organisation reachable by direct link? Can community users follow Private or Unlisted organisations? What do followers see? | modules/organisation/ORGANISATION_PROFILE.md, modules/community/COMMUNITY_AND_DISCOVERY.md | 05 |
| OQ-11 | ~~Resolved by ADR-017 (all management members, minimal content; community users none).~~ Who receives each notification event (e.g. "event publication": followers or members; "subscription changes": owner only)? Do community users receive notifications? | architecture/NOTIFICATION_ARCHITECTURE.md | 10 |
| OQ-12 | Bahasa Melayu/English localisation has no owning phase. When is the i18n framework introduced, and must every phase ship both languages? | architecture/LOCALISATION_AND_TIMEZONE.md | 00–09 |
| OQ-13 | ~~Resolved by ADR-016 §4.~~ Under ADR-006, can a user be staff in org A and owner of org B? Does "actively manages" cover admin/treasurer roles too? Is organisation switching needed? | ADR-006, saas/ORGANISATION_ACCOUNT_MODEL.md | 02 |
| OQ-14 | ~~Resolved by ADR-020 (Accepted 2026-10-06); malware scanning deferred to Phase 12.~~ Concrete "safe file upload" rules: allowed types, size limits, malware scanning. | architecture/SECURITY_ARCHITECTURE.md, ADR-014 | 05, 08 |
| OQ-15 | What data retention and deletion rules apply (archived organisations, user account deletion, audit-log retention, PDPA obligations)? | architecture/DATA_MODEL_SPECIFICATION.md (only "not silently hard-deleted") | 08, 12 |
| OQ-16 | ~~Resolved by ADR-023 (Accepted 2026-10-06): the visitor's location.~~ Are prayer times shown for the organisation's location only, or also for the viewer's location? | modules/islamic-features/PRAYER_TIMES.md, ADR-012 | 09 |
| OQ-17 | ~~Resolved by ADR-021 (Accepted 2026-10-06).~~ Hub: can ARCHIVED content be re-published? What fields does an event have (start/end, timezone, location)? Legacy disposition lists "events/classes", but the hub spec has no "classes". | modules/information-hub/INFORMATION_HUB.md, product/LEGACY_FEATURE_DISPOSITION.md | 06 |
| OQ-18 | Production targets: backup RPO/RTO, monitoring/alerting expectations. | implementation-roadmap/PHASE_12_PRODUCTION.md | 12 |
| OQ-19 | Break-glass (audited) platform access to tenant data: is it ever allowed? (Not in MVP per ADR-015.) | ADR-015 §5 | post-MVP |
| OQ-20 | ~~Deferred by ADR-016 §4 (direct add stays in MVP; invites after Phase 10).~~ Invitation/consent flow for adding members (today an owner adds an existing user directly). | Phase 02 review | 04 |
| OQ-21 | ADR-024 (operations status sets, fields, deletion rules) is Proposed: confirm or amend. ADR-022 §8 and ADR-023 §3/§4 hold implementer defaults awaiting confirmation. | ADR-022, ADR-023, ADR-024 | 07, 08, 09 (built with the defaults) |
| OQ-22 | Phase 12: public-read policy for the `public/` object prefix (or a separate public bucket/CDN), and malware scanning of uploads before production (ADR-020). | ADR-014, ADR-020 | 12 |
