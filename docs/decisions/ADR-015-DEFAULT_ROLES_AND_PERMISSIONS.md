# ADR-015-DEFAULT_ROLES_AND_PERMISSIONS

## Status
Proposed (2026-10-05). Requires user approval before Phase 03 starts. Resolves OQ-04 and OQ-05 once Accepted.

## Context
Spec lines that drive this decision:
- `architecture/ROLE_PERMISSION_MATRIX.md`: "Initial roles: owner, admin, treasurer, committee, staff. Roles are collections of permissions. Example permissions: organisation.read/update, bulletin.publish, event.manage, operations.manage, finance.income.create, finance.expense.create, finance.approve, finance.audit.read. Sensitive permissions are enforced server-side."
- `saas/FEATURE_ENTITLEMENTS.md`: "Permissions answer **can this role act?** Entitlements answer **does this organisation plan include the capability/limit?** Both may be required … Do not scatter `plan === ...` checks throughout modules."
- `product/USER_PERSONAS.md`: "Organisation Owner; Administrator; Treasurer; Committee/Staff; Community User; Platform Administrator. Platform administration is separate from tenant financial authority."
- `saas/ORGANISATION_ACCOUNT_MODEL.md`: "An organisation can still have authorised staff/committee memberships … Organisation creation creates organisation + owner membership as one coherent workflow."
- `saas/LIFECYCLE_STATE_MACHINE.md`: "Organisation: DRAFT → ONBOARDING → ACTIVE; ACTIVE → SUSPENDED; ACTIVE/SUSPENDED → ARCHIVED." Subscription: "TRIAL → ACTIVE/EXPIRED; ACTIVE → PAST_DUE/CANCELLED; PAST_DUE → ACTIVE/EXPIRED."
- `architecture/SECURITY_ARCHITECTURE.md`: "AUTH-003 authorisation is independent of frontend visibility."
- `architecture/DATA_MODEL_SPECIFICATION.md`: tenant models include OrganisationMembership, FinancialCategory, Income, Expense, Collection, Budget, Approval and Audit records.
- `modules/operations/OPERATIONS.md`: "Generic models must not hard-code Masjid-specific job titles."
- `finance/FINANCIAL_AUDIT_LOGS.md`: "Ordinary users must not modify protected audit history."
- `implementation-roadmap/README.md`, parallel-work rule 4: "Permission keys are defined in Phase 03. Parallel phases use them and do not invent new keys without integrator review."
- ADR-009: roles and permissions are resolved server-side per request, never from token claims. ADR-010: permission keys are defined in the backend and exposed to the frontend through the API.
- ADR-013 (Proposed): self-approval is blocked unless the requester is the only active member whose roles grant `finance.approve`; "Phase 03 must define which default roles hold `finance.approve`."

The specs name five roles and give eight example keys. They give no complete key list, no role-to-key mapping, no rule on custom roles and no powers for the Platform Administrator. Everything below that is not quoted above is marked **Assumption** or is a recommendation for the user to confirm.

## 1. Permission key catalogue

Naming: `<resource>.<action>` or `<module>.<resource>.<action>`, lower case. The eight example keys in `ROLE_PERMISSION_MATRIX.md` are kept exactly as written (e.g. `organisation.read`, not `org.read`) so the spec stays true. New keys follow the same style.

Only actions that the specs describe get a key. Reading public content (published hub posts, public profiles, prayer times) needs no permission. Acting on your own user record (own notifications, own profile) is self-scoped and needs no permission.

### Organisation (4)
| Key | Allows | Source |
|---|---|---|
| `organisation.read` | View the internal organisation workspace, including a Private profile. | ROLE_PERMISSION_MATRIX (example key); ORGANISATION_PROFILE |
| `organisation.update` | Edit profile fields (name, logo, cover, description, type, contacts, location, links), visibility, location context used by prayer times (ADR-012), and complete onboarding (DRAFT → ONBOARDING → ACTIVE). | ROLE_PERMISSION_MATRIX (example key); ORGANISATION_PROFILE; LIFECYCLE_STATE_MACHINE; ADR-012 |
| `organisation.archive` | Tenant-initiated ACTIVE/SUSPENDED → ARCHIVED. **Assumption:** the specs do not say who may archive; this ADR lets the owner archive their own organisation. | LIFECYCLE_STATE_MACHINE |
| `organisation.ownership.transfer` | Transfer the owner role to another active member (see §6). | ORGANISATION_ACCOUNT_MODEL (owner membership); §6 |

### Members (2)
| Key | Allows | Source |
|---|---|---|
| `members.read` | List the organisation's memberships, their roles and display titles. | ORGANISATION_ACCOUNT_MODEL; GLOSSARY (Membership) |
| `members.manage` | Add or remove memberships and change their roles, subject to the rules in §6. | ORGANISATION_ACCOUNT_MODEL ("authorised staff/committee memberships") |

### Information hub (4)
| Key | Allows | Source |
|---|---|---|
| `bulletin.manage` | Create, edit and delete DRAFT announcements/bulletin posts; view drafts. | INFORMATION_HUB |
| `bulletin.publish` | DRAFT → PUBLISHED and PUBLISHED → ARCHIVED for bulletin posts. | ROLE_PERMISSION_MATRIX (example key); INFORMATION_HUB |
| `event.manage` | Create, edit and delete DRAFT events; view drafts. | ROLE_PERMISSION_MATRIX (example key); INFORMATION_HUB |
| `event.publish` | DRAFT → PUBLISHED and PUBLISHED → ARCHIVED for events. | INFORMATION_HUB |

Why `*.publish` is separate from `*.manage`: the spec already separates `bulletin.publish`, and publishing makes content public, which is a different risk from drafting. `event.publish` is added so events and bulletins behave the same. The spec's `event.manage` keeps its name but no longer covers publishing. **Assumption:** confirm this narrowing of `event.manage`.

### Operations (2)
| Key | Allows | Source |
|---|---|---|
| `operations.read` | View programmes, tasks and rosters. | OPERATIONS |
| `operations.manage` | Create, edit and delete programmes, tasks and rosters, and assign people. | ROLE_PERMISSION_MATRIX (example key); OPERATIONS |

Rule (not a key): an assignee who holds `operations.read` may change the status of a task assigned to them. **Assumption:** the spec says tasks have "assignment/due date/status" but not who updates status.

### Finance (9)
| Key | Allows | Source |
|---|---|---|
| `finance.read` | View income, expenses, collections, budgets and budget-versus-actual reports. | FINANCIAL_OVERVIEW; BUDGETING; ORGANISATION_PROFILE ("internal finance … data is never public") |
| `finance.income.create` | Create, edit and submit DRAFT income records. | ROLE_PERMISSION_MATRIX (example key); INCOME_MANAGEMENT; FINANCIAL_STATE_MACHINE |
| `finance.expense.create` | Create, edit and submit DRAFT expense records, including evidence uploads. | ROLE_PERMISSION_MATRIX (example key); EXPENSE_MANAGEMENT |
| `finance.collection.manage` | Create and update collections (purpose, progress). | COLLECTION_MANAGEMENT |
| `finance.budget.manage` | Create and update budgets. | BUDGETING |
| `finance.category.manage` | Create and update financial categories. | DATA_MODEL_SPECIFICATION (FinancialCategory) |
| `finance.approve` | Approve or reject records in PENDING_APPROVAL, subject to ADR-013. | ROLE_PERMISSION_MATRIX (example key); FINANCIAL_APPROVALS; ADR-013 |
| `finance.void` | Move a permitted record to VOIDED. Which states may be voided is still OQ-06. | FINANCIAL_STATE_MACHINE |
| `finance.audit.read` | Read the financial audit log. No key grants writing or changing audit history. | ROLE_PERMISSION_MATRIX (example key); FINANCIAL_AUDIT_LOGS |

Phase 08 decides whether the create keys allow editing another member's DRAFT, and whether collections and budgets go through the state machine (OQ-07). Those answers change service rules, not this key list.

### Billing: Masyarakat subscription (2)
| Key | Allows | Source |
|---|---|---|
| `billing.read` | View the organisation's plan, trial and subscription status. | SUBSCRIPTION_AND_BILLING |
| `billing.manage` | Tenant-initiated subscription actions, such as cancel (ACTIVE → CANCELLED). Exactly which actions exist is settled with OQ-02/OQ-03 in Phase 11. | LIFECYCLE_STATE_MACHINE; SUBSCRIPTION_AND_BILLING |

`billing.*` and `finance.*` never imply each other (SAAS-001).

### Islamic features and notifications (0)
No keys. Reading prayer times, Hijri dates and Qibla is not a sensitive action, and the organisation's location context is edited under `organisation.update`. Each user reads and marks only their own notifications. Who receives which notification is OQ-11, not a permission. If a later spec adds a sensitive action here (e.g. a per-organisation prayer-time override), add the key by amending this ADR.

**Tenant total: 23 keys.** Platform keys are in §5.

## 2. Default organisation roles

The five roles from `ROLE_PERMISSION_MATRIX.md` are fixed system roles identified by stable keys: `owner`, `admin`, `treasurer`, `committee`, `staff`. The UI shows localised labels (EN/BM, e.g. Owner/Pemilik, Administrator/Pentadbir, Treasurer/Bendahari, Committee/Jawatankuasa, Staff/Kakitangan). These are generic organisation terms, not Masjid-only ones.

Masjid-specific or organisation-specific titles such as "Nazir", "Imam" or "Siak" are a free-text **display title** on the membership. A title has no effect on permissions. This keeps generic modules free of Masjid-only assumptions (ORG-007, OPERATIONS) while letting a mosque see its own titles. **Assumption:** confirm the free-text display title. The alternative is a list of suggested presets per organisation type, which is UI-only and can be added later.

### Roles per membership
- **A. One role per membership.** Simplest. But a treasurer who also posts announcements needs two roles, so either the treasurer gets hub keys they may not need or the organisation over-grants with `admin`.
- **B. One or more roles per membership; effective permissions are the union (recommended).** Small cost (a membership-role join table), and it matches ADR-013's wording "memberships whose roles grant `finance.approve`". Exactly one membership in an organisation holds `owner`.

### Role × permission matrix (recommended defaults)

| Key | owner | admin | treasurer | committee | staff |
|---|:-:|:-:|:-:|:-:|:-:|
| `organisation.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `organisation.update` | ✓ | ✓ | | | |
| `organisation.archive` | ✓ | | | | |
| `organisation.ownership.transfer` | ✓ | | | | |
| `members.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `members.manage` | ✓ | ✓ | | | |
| `bulletin.manage` | ✓ | ✓ | | ✓ | ✓ |
| `bulletin.publish` | ✓ | ✓ | | ✓ | |
| `event.manage` | ✓ | ✓ | | ✓ | ✓ |
| `event.publish` | ✓ | ✓ | | ✓ | |
| `operations.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `operations.manage` | ✓ | ✓ | | ✓ | |
| `finance.read` | ✓ | ✓ | ✓ | ✓ | |
| `finance.income.create` | ✓ | | ✓ | | |
| `finance.expense.create` | ✓ | | ✓ | | |
| `finance.collection.manage` | ✓ | | ✓ | | |
| `finance.budget.manage` | ✓ | | ✓ | | |
| `finance.category.manage` | ✓ | | ✓ | | |
| `finance.approve` | ✓ | | ✓ | | |
| `finance.void` | ✓ | | ✓ | | |
| `finance.audit.read` | ✓ | ✓ | ✓ | | |
| `billing.read` | ✓ | ✓ | | | |
| `billing.manage` | ✓ | | | | |

Intent of each role:
- **owner:** every tenant key. The accountable account holder (ORGANISATION_ACCOUNT_MODEL).
- **admin:** runs the workspace (profile, members, content, operations) and can see finance, but holds no finance write or approval authority. Financial authority stays with finance roles.
- **treasurer:** full finance authority, read-only elsewhere.
- **committee:** governance and content. Publishes, manages operations and can see finance.
- **staff:** day-to-day helpers. Drafts content and works assigned tasks. No finance access.

**Assumption:** every cell above except `finance.approve` is a recommendation, not derived from a spec. The specs fix only the role names and the example keys.

### Who holds `finance.approve` (OQ-04, needed by ADR-013)
- **A. owner + treasurer (recommended).** In a typical small organisation the treasurer records and the owner approves, or the other way round, so ADR-013's segregation works as soon as both roles are filled. A one-person organisation falls back to ADR-013's flagged sole-approver exception.
- **B. owner only.** Strong control, but the treasurer can never approve, and every record the owner creates is self-approved while they are the only approver.
- **C. owner + admin + treasurer.** More approvers, but it gives a general administrator financial authority, which goes against the separation the personas draw.

## 3. Custom roles in MVP

- **A. Fixed system roles only (recommended).** The five roles and their mapping above are defined as a constant in backend code, not in database rows. A membership stores role keys. No role-editing UI, nothing to migrate per organisation, trivially testable. Organisations combine roles (Option B in §2) to fit their structure.
- **B. Fixed roles with per-organisation overrides** (owner toggles keys on a role). Flexible, but it needs settings UI, needs a rule for who may change overrides, and needs to protect the ADR-013 approver count against overrides. Medium cost.
- **C. Fully custom roles** (create, name and compose permissions). The most flexible and the most work: role CRUD, escalation checks on role edits, and audit. Over-scoped for MVP (MVP_SCOPE excludes a generic enterprise workflow engine; PHASE_03 excludes "complex workflow engine").

Decision (recommended): A. Because checks are made against keys, never against role names (RBAC-002), moving to B or C later changes only where the mapping comes from, not the call sites. Moving to B or C requires a new ADR, and may become an entitlement (e.g. Professional "governance") at that point.

## 4. Permissions vs entitlements

Restating FEATURE_ENTITLEMENTS and RBAC-004: a permission check (does this member's role allow the action?) and an entitlement check (does this organisation's subscription include the feature or quota?) are separate functions, and both must pass. Neither implies the other. They return distinct errors (SEC-005), e.g. `FORBIDDEN` for a missing permission and `ENTITLEMENT_REQUIRED` for a missing entitlement, so the UI can say "ask your owner" or "upgrade your plan". Entitlements are checked by feature key through the central gate from Phase 11 and are never checked by plan name (SAAS-007).

Which keys are also entitlement-gated, by feature (not by plan). The plan-to-feature mapping stays open under OQ-01; this table fixes only which feature each key would check.

| Permission keys | Entitlement feature checked | Note |
|---|---|---|
| `finance.*` | `finance` (boolean) | Candidate. Whether every plan has finance is OQ-01. |
| `finance.budget.manage`, budget-versus-actual reports | `finance.reporting` (boolean) | Candidate. Professional lists "governance and reporting". |
| `bulletin.*`, `event.*` | `hub` (boolean); possible numeric quotas | Candidate quotas are an OQ-01 decision. |
| `operations.*` | `operations` (boolean) | Starter lists "broader operational capabilities". |
| `members.manage` (adding a member) | `members.max` (numeric quota) | Candidate. |
| none | `islamic` (boolean) | Islamic features need no permission but may still be entitlement-gated (OQ-01). |
| `organisation.*`, `members.read`, `members.manage` (removing), `billing.*` | never gated | An organisation must always be able to manage its account, its members and its subscription, including when EXPIRED or PAST_DUE. |

**Assumption:** `finance.approve` must not be gated separately from `finance`. If approvals were off while recording was on, records could not leave PENDING_APPROVAL.

Organisation lifecycle (e.g. SUSPENDED blocks tenant writes) is a third, separate check that Phase 04 owns. It is neither a permission nor an entitlement.

## 5. Platform Administrator (OQ-05)

The Platform Administrator operates Masyarakat itself. They are not a member of any tenant, so they hold none of the tenant keys above. That includes `finance.*` (RBAC-006: "Platform administration is separate from tenant financial authority").

### How the role is held and authenticated
- **A. Platform flag on the User, set only out of band (recommended).** For example `User.platformRole = 'platform_admin'`, set by a backend CLI or seed script and never through any API. Same login and JWT as ADR-009. Platform endpoints live under `/platform/*` behind `requireAuth` + `requirePlatformAdmin`, which re-reads the flag from the database per request (AUTH-008). A platform admin account holds no organisation memberships (**assumption**: separate account from any personal or tenant account).
- **B. Separate admin realm** (own user table, login and token audience). Strongest separation, but it duplicates identity code from Phase 01.
- **C. No platform UI or API in MVP; operators use SQL/scripts.** Least code, but unaudited direct database edits are worse than an audited endpoint, and OQ-03 likely needs a manual subscription activation step.

### Platform keys (4)
One platform role in MVP. Keys are still used so that the role can be split later without touching call sites.

| Key | Allows | Source |
|---|---|---|
| `platform.organisations.read` | List organisations with metadata only: name, type, visibility, lifecycle state, owner contact, created date, subscription state. No tenant content. | LIFECYCLE_STATE_MACHINE; USER_PERSONAS |
| `platform.organisations.suspend` | ACTIVE → SUSPENDED, with a required reason. | LIFECYCLE_STATE_MACHINE |
| `platform.organisations.archive` | ACTIVE/SUSPENDED → ARCHIVED, with a required reason. | LIFECYCLE_STATE_MACHINE |
| `platform.subscriptions.manage` | Operator-driven subscription transitions (e.g. manual TRIAL → ACTIVE after an offline payment), as settled by OQ-03. | LIFECYCLE_STATE_MACHINE; OQ-03 |

Spec gap: the lifecycle has no SUSPENDED → ACTIVE (reinstate) transition. A suspension is therefore permanent short of archive. The lifecycle spec needs an amendment if reinstatement is wanted; this ADR does not add it.

### Access to tenant data
- **A. None in MVP (recommended).** Platform endpoints return organisation metadata only. Support works through the organisation owner. This is the only option that fully keeps finance and member data inside the tenant.
- **B. Audited break-glass read.** Read-only, time-boxed (e.g. 1 hour), requires a written reason, is written to a platform audit log and notifies the organisation owner. Useful for support, but needs its own design and should be its own ADR.
- **C. Unrestricted read.** Rejected. It breaks the separation from tenant financial authority and tenant isolation.

All platform actions write a platform audit record (actor, action, target organisation, reason, timestamp). **Assumption:** MFA for platform admin accounts is strongly recommended before production (Phase 12), but it is not specified anywhere.

### Owning phases
- **Phase 03:** the platform flag, `requirePlatformAdmin`, the platform key constants, the CLI to grant or revoke the flag, and the platform audit record.
- **Phase 04:** `platform.organisations.read/suspend/archive` endpoints, alongside the organisation lifecycle.
- **Phase 11:** `platform.subscriptions.manage`, after OQ-02/OQ-03.

## 6. Safety rules

1. **Exactly one owner.** Organisation creation creates the owner membership atomically (ORG-001). The owner membership cannot be removed, and the `owner` role cannot be revoked, except by ownership transfer.
2. **Ownership transfer** (`organisation.ownership.transfer`) is atomic: the target must be an active member of the same organisation, the target gains `owner`, and the previous owner keeps their other roles plus `admin` (**assumption**). The transfer is audited. Whether the target may already manage another organisation is OQ-13 (ADR-006).
3. **No self-escalation.**
   - Nobody changes their own roles.
   - An actor may grant or revoke a set of roles only if the union of that set's permissions is a subset of the actor's own permissions. With the defaults above, only the owner can grant `treasurer`, because admin lacks the finance write keys. This stops an admin from making themselves, or an account they control, a finance approver.
   - `owner` is granted only through transfer.
   - The platform flag is never settable through the API.
4. **Finance separation of duties** follows ADR-013. The approver count is tenant-scoped and counts active memberships whose roles grant `finance.approve`. Every role change is audited (actor, target membership, roles before/after, timestamp), so removing approvers to unlock self-approval is visible, as ADR-013 relies on. No key grants writing or editing audit records (FIN-015).
5. **Fail closed.** An unknown key, a missing membership or a membership of another organisation means deny. Permissions are evaluated against the membership in the server-resolved organisation context (TENANT-003, AUTH-008), never against client-sent roles. A role change takes effect on the next request.
6. **Frontend visibility only.** The API returns the caller's effective permission keys for the current organisation (RBAC-005) so the UI can hide controls. The server checks again on every request (AUTH-003).

## Decision (recommended)
- Adopt the 23 tenant keys in §1 and the 4 platform keys in §5 as the canonical catalogue. New keys are added only by amending this ADR (roadmap rule 4).
- Five fixed system roles, more than one allowed per membership, with the matrix in §2. `finance.approve` is held by owner and treasurer.
- No custom roles in MVP (§3, Option A).
- Permission and entitlement checks are separate and both required, with entitlements checked by feature (§4).
- Platform Administrator: a platform flag set out of band, metadata-only access, no tenant data access in MVP, and all platform actions audited (§5, Option A + A). Phases 03, 04 and 11 own the parts listed in §5.
- Safety rules in §6.

## Consequence
- Phase 03 implements the key constants, the role-to-key mapping, `requirePermission(key)`, the membership-role model, the self-escalation and last-owner rules, the effective-permissions endpoint, and the platform flag and guard. It tests every rule in §6, plus a test that every mutating tenant route declares a permission key.
- Phases 04–11 use only keys from this ADR.
- `ROLE_PERMISSION_MATRIX.md` should, once this ADR is Accepted, point to this ADR as the full matrix and note the narrowed meaning of `event.manage`.
- Proposed requirement IDs for the integrator to add to `REQUIREMENTS_TRACEABILITY.md` (Phase 03 unless noted):
  - RBAC-007: Permission keys come only from the ADR-015 catalogue, and the role mapping is fixed in code (no custom roles in MVP).
  - RBAC-008: Exactly one owner. The owner cannot be removed or demoted except by atomic ownership transfer.
  - RBAC-009: No self-escalation. Nobody changes their own roles, and an actor grants only roles whose permissions are a subset of their own.
  - RBAC-010: Unknown keys, missing memberships and foreign-organisation memberships are denied (fail closed).
  - RBAC-011: Role changes are audited.
  - RBAC-012: The Platform Administrator holds no tenant permissions and has no tenant data access. The flag is set out of band, and platform actions are audited. (03, 04, 11)
- OQ-04 and OQ-05 are closed when this ADR is Accepted. The SUSPENDED → ACTIVE gap (§5) and the break-glass question are new items for the integrator to log.
