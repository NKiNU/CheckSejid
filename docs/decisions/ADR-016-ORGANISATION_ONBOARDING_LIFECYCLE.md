# ADR-016-ORGANISATION_ONBOARDING_LIFECYCLE

## Status
Accepted (2026-10-05) by the product owner, with the recommended option for all four questions. Closes OQ-13 and OQ-20 (deferred).

## Context
- `saas/LIFECYCLE_STATE_MACHINE.md`: "Organisation: DRAFT → ONBOARDING → ACTIVE; ACTIVE → SUSPENDED; SUSPENDED → ACTIVE (reinstate …); ACTIVE/SUSPENDED → ARCHIVED."
- `saas/ORGANISATION_ACCOUNT_MODEL.md`: "Organisation creation creates organisation + owner membership as one coherent workflow."
- `modules/organisation/ORGANISATION_PROFILE.md`: "Fields may include name, logo, cover, description, type, contacts, location and links."
- ADR-015 §1/§4/§5: `organisation.update` completes onboarding; `organisation.archive` is owner-only; the lifecycle check is separate from permissions and entitlements and is owned by Phase 04; the platform suspend/reinstate/archive endpoints are built in Phase 04.
- `PHASE_04_ONBOARDING.md` says only "onboarding works". It does not say what triggers each transition, what each state allows, or which profile fields apply.

## Decision

### 1. Transitions
| From → To | Trigger | Who |
|---|---|---|
| (none) → DRAFT | Organisation creation (ORG-001) | any authenticated user who owns no organisation |
| DRAFT → ONBOARDING | Automatically, on the first successful profile update | `organisation.update` |
| ONBOARDING → ACTIVE | "Complete onboarding" action. Requires name, type, state and country to be set. | `organisation.update` |
| ACTIVE → SUSPENDED | Platform action with a required reason | `platform.organisations.suspend` |
| SUSPENDED → ACTIVE | Platform reinstatement with a required reason | `platform.organisations.suspend` |
| ACTIVE/SUSPENDED → ARCHIVED | Tenant action (optional reason) | `organisation.archive` (owner) |
| ACTIVE/SUSPENDED → ARCHIVED | Platform action with a required reason | `platform.organisations.archive` |

Any other transition is rejected with `409 INVALID_STATE_TRANSITION`. Transitions are applied atomically (conditional update on the current state). Tenant transitions write `AuditLog`. Platform transitions write `PlatformAuditLog`.

### 2. What each state allows (lifecycle guard)
One server-side lifecycle guard, separate from permissions and entitlements:
- **DRAFT / ONBOARDING:** organisation profile, members and RBAC routes work. Module routes (hub, operations, finance, from Phases 06–08) require ACTIVE.
- **ACTIVE:** everything (still subject to permissions and entitlements).
- **SUSPENDED:** reads are allowed. All tenant writes are blocked (`409 ORGANISATION_NOT_WRITABLE`), except self-leave and tenant archive.
- **ARCHIVED:** terminal. Members keep read-only access. Writes are blocked, except self-leave.
- Only ACTIVE organisations may ever appear publicly. Phase 05 applies this together with visibility (ORG-006).

### 3. Profile fields in Phase 04
- `type` ∈ `masjid`, `surau`, `madrasah`, `school`, `ngo`, `other`. These are generic values, not Masjid-only (ORG-007).
- `description`, `contactEmail`, `contactPhone`, `addressLine`, `state`, `country` (ISO 3166-1 alpha-2) and `links` (at most 10 `{label, url}`, http/https only).
- Logo and cover move to Phase 05, because they depend on the upload rules (OQ-14). Visibility stays in Phase 05 (OQ-10).

### 4. Membership (OQ-13, OQ-20)
- OQ-13: a user may be a member (any non-owner role) of several organisations, but may own at most one (`Organisation.ownerId @unique`, already enforced). "Actively manages" in ADR-006 means owning. The existing organisation list is the switcher.
- OQ-20: the MVP keeps direct add-by-email for existing users. An invitation/consent flow is deferred until notifications exist (Phase 10 or later).

### Assumptions (small; reverse by amending this ADR)
- Organisations that already exist when the migration runs (development data only) are backfilled to ACTIVE.
- The owner of an ARCHIVED organisation still counts as its owner, so they cannot create a new organisation in MVP. Revisit with OQ-15 (retention/deletion).
- There is no platform UI in Phase 04. The platform endpoints are API-only, and a platform admin is created by the existing CLI.

## Consequence
Phase 04 implements §1–§3 and the platform endpoints from ADR-015 §5 (`platform.organisations.read/suspend/archive`). Later phases mount module routers behind the "requires ACTIVE" guard. New requirement IDs: ORG-008 (transition triggers and rules), ORG-009 (lifecycle guard).
