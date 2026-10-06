# ADR-018-SUBSCRIPTIONS_TRIAL_ENTITLEMENTS

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-01, OQ-02 and OQ-03. Approves one spec extension: EXPIRED/CANCELLED → ACTIVE (resubscribe), recorded in `saas/LIFECYCLE_STATE_MACHINE.md`.

## Context
- `business/SUBSCRIPTION_PLANS.md`: "Free: entry-level presence/basic use. Starter: broader operational capabilities. Professional: advanced limits, governance and reporting. Prices and quotas are commercial configuration and must not be hard-coded across business features."
- `saas/SUBSCRIPTION_AND_BILLING.md`: SAAS-001 (organisation finance and platform billing are separate), SAAS-002 (subscription determines entitlements/limits), SAAS-003 (30-day trial), provider abstraction when a payment provider is introduced.
- `saas/FEATURE_ENTITLEMENTS.md`: boolean or numeric entitlements; no scattered `plan === …` checks.
- `saas/LIFECYCLE_STATE_MACHINE.md`: "Subscription: TRIAL → ACTIVE/EXPIRED; ACTIVE → PAST_DUE/CANCELLED; PAST_DUE → ACTIVE/EXPIRED. Internal states remain independent from provider-specific events."
- `product/MVP_SCOPE.md` / SAAS-011: no online payment processing in MVP.
- ADR-015 §4: entitlement checks are separate from permission checks, return `ENTITLEMENT_REQUIRED` (not `FORBIDDEN`), are checked by feature key, and never gate `organisation.*`, `members.read`, member removal or `billing.*`. ADR-015 §5: `platform.subscriptions.manage` is built in Phase 11.
- ADR-017: notifications go to every member except the actor, with a minimal non-sensitive title.

## Decision

### 1. Plans and entitlements (OQ-01)
- Plans are database configuration: a global `Plan` table (`key`, `name`, `entitlements` JSON) seeded by migration. Values are changed in the database, never in code (SAAS-005).
- The entitlement **catalogue** (the keys) lives in code (`backend/src/modules/subscriptions/entitlements.ts`). A key missing from a plan, or a malformed value, is denied (fail closed). A `null` quota means unlimited.
- Catalogue, using the feature names from ADR-015 §4:

| Key | Kind | Gates |
|---|---|---|
| `operations` | boolean | Operations module (Phase 07) |
| `finance` | boolean | Finance module, including approvals (Phase 08); `finance.approve` is never gated separately (ADR-015 §4) |
| `finance.reporting` | boolean | Budgets and budget-versus-actual reporting (Phase 08) |
| `members.max` | quota | Adding a membership. Every membership counts, the owner included |

- Seeded defaults (commercial configuration, editable without code):

| Plan | `operations` | `finance` | `finance.reporting` | `members.max` |
|---|:-:|:-:|:-:|:-:|
| Free | | | | 5 |
| Starter | ✓ | ✓ | | 25 |
| Professional | ✓ | ✓ | ✓ | unlimited |

- Never gated on any plan: the public profile, the information hub (`hub`), Islamic features (`islamic`), `organisation.*`, `members.read`, member removal and `billing.*`. ADR-015 §4 listed `hub` and `islamic` as candidates; they are not in the catalogue, so Phases 06 and 09 mount no entitlement guard.

### 2. Trial and lapse (OQ-02)
- Every new organisation gets a subscription in the same transaction as the organisation: status `TRIAL`, plan `professional`, `trialEndsAt` = creation + 30 days (SAAS-003). Organisations that exist when the migration runs are backfilled the same way.
- `EXPIRED` or `CANCELLED`: the organisation falls back to the Free plan's entitlements. Data is kept and stays readable. Gated features are blocked, and creates over a quota are blocked; existing rows above a quota are not deleted.
- `PAST_DUE`: keeps the paid plan's entitlements (grace period) until a platform administrator moves it to `ACTIVE` or `EXPIRED`.

### 3. Activation and transitions (OQ-03)
- No online payment in MVP. Payment is offline (invoice / bank transfer). A Platform Administrator (`platform.subscriptions.manage`, via `requirePlatformAdmin`) drives every manual transition with a mandatory reason, audited in `PlatformAuditLog` (action, reason, and `{ from, to, planKey, previousPlanKey }`):

| Action | From → To |
|---|---|
| `activate` (sets plan) | TRIAL → ACTIVE; PAST_DUE → ACTIVE; EXPIRED/CANCELLED → ACTIVE (resubscribe, §4); ACTIVE → ACTIVE (plan change: upgrade or downgrade) |
| `past-due` | ACTIVE → PAST_DUE |
| `cancel` | ACTIVE → CANCELLED |
| `expire` | PAST_DUE → EXPIRED |

- TRIAL → EXPIRED is automatic once `trialEndsAt` passes. It is computed on read (effective status) and persisted at the start of the next subscription write. No scheduled job in MVP.
- Any other transition returns `409 INVALID_STATE_TRANSITION`. Transitions lock the subscription row, so concurrent changes are serialised.
- `billing.manage` remains reserved: MVP has no tenant-initiated subscription action. An owner asks the platform (e.g. to cancel) out of band.

### 4. Spec extension: resubscribe
EXPIRED/CANCELLED → ACTIVE, platform administrator only, with a reason, audited. Approved by the product owner on 2026-10-06.

### 5. Provider seam (SAAS-010)
Internal states change only through one function, `transitionSubscription()` in `subscriptions.service.ts`. A future payment-provider adapter maps its events onto the actions above and calls that function. No provider interface is built until a provider exists.

### 6. Separation (SAAS-001)
Subscriptions are their own module and tables (`Plan`, `Subscription`). They hold no amounts and never reference organisation finance records, and finance never references them.

### 7. Gate and errors
- `requireEntitlement(feature)` is chained after `requirePermission(key)`. Both must pass (RBAC-004). A missing entitlement returns `403 ENTITLEMENT_REQUIRED`.
- `assertQuota(tx, organisationId, quota, current)` runs inside the write's transaction, under the lock that serialises the counted rows. Over quota returns `403 QUOTA_EXCEEDED`. `members.max` is checked under the organisation row lock in `addMember`.
- No module checks a plan key or name (SAAS-007).

### 8. Notifications
Each subscription change emits `subscription.changed` through `notify()` in the same transaction (ADR-017): every member, with a title of plan name and status only (no amounts).

## Consequence
Phase 11 builds the `Plan`/`Subscription` tables and seed, trial creation, the entitlement gate, the `members.max` quota, `GET /orgs/:orgId/subscription` (`billing.read`), the platform subscription actions, the subscription state in the platform organisation list, and a minimal UI. Phases 07 and 08 mount `requireEntitlement("operations")`, `requireEntitlement("finance")` and `requireEntitlement("finance.reporting")` on their routes.
