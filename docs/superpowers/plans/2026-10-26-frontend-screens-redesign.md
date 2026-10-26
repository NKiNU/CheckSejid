# Frontend Screens Redesign (part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Tasks run **in order, one at a time** (shared kit and router files; not parallel).

**Goal:** Move every existing panel to the ADR-028 look, one module at a time, with behaviour unchanged, then delete the `.legacy` base style.

**Spec:** `docs/superpowers/specs/2026-10-26-frontend-screens-redesign-design.md`. Decision: `docs/decisions/ADR-028-FRONTEND_UI_FOUNDATION.md`. Run commands from `frontend/`. Branch: new `feature/frontend-screens` off the part 1 branch once it is merged (or stacked on `feature/frontend-foundation`).

## Global Constraints
- **Behaviour frozen:** keep `api.ts` calls, handlers, form field `name`s, `perms` checks and error handling verbatim. Only markup/classes/components change.
- All strings via `useT()`; every new key in both `src/i18n/en.ts` and `ms.ts` (parity test passes).
- No new dependencies. No toast/table/sheet library. Use Radix via the installed `radix-ui` package.
- Cards: shadow, no border. Targets ≥ 44px. Inputs 16px. No ungated `:hover`. No horizontal scroll at 320px. Zoom never disabled.
- Status = `Badge` with text label (never colour-only); red only for destructive meaning.
- Destructive actions use `ConfirmDialog`; the finance void reason uses a `FormDialog` with a required textarea (same API payload as the current `prompt()`).
- Component tests: pure functions only (no jsdom). DOM checked in Playwright.
- Commits: one or more per task on the feature branch, message ends with the attribution lines from the session. Never commit `.env`; never push to `develop`/`main`.
- Implementation subagents on Sonnet; Opus for per-module review. `ecc:react-reviewer` runs per module (no auth/API change, so no security-reviewer pass until the close task).

## Per-module Definition of Done (repeat in every task)
- [ ] The module's routes no longer sit under a `.legacy` wrapper and no bare-element styling is relied on.
- [ ] List screens have empty, loading and error states; forms show `role="alert"` errors.
- [ ] `npm run build`, `npm run lint`, `npx vitest run` pass (i18n parity included).
- [ ] Playwright at 320×700, 390×844 and 1280×800, light + dark, EN + BM: main flow, destructive confirm and its cancel path, a permission-less user (control hidden). Screenshots in the scratchpad.
- [ ] `break-ui` worst case at 320px: long and non-Latin names, zero items, 500 rows.
- [ ] `ecc:react-reviewer` findings fixed. Behaviour diff checked against the pre-change flow.

---

### Task 0: Prep — `.legacy` per route and the shared kit

**Files:** Modify `src/app/Shell.tsx` (remove `legacy` from `<main>`), `src/app/router.tsx`, `src/app/OrgPages.tsx` (wrap each unmigrated route element in `<div className="legacy">`). Create `src/components/ui/{badge,select,textarea,dialog}.tsx`, `src/components/ConfirmDialog.tsx`, `src/components/FormDialog.tsx`.

**Interfaces produced:**
- `Badge({ variant: 'neutral'|'success'|'warning'|'destructive', children })`
- `Select` (styled native `<select>`, same props), `Textarea`
- `Dialog` (Radix, bottom-anchored under 640px, centred above, ≤200ms ease-out, no transform under reduced motion)
- `ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, destructive?, onConfirm })`
- `FormDialog({ open, onOpenChange, title, onSubmit, submitLabel, error, children })` (submit handler receives the `FormEvent`, so existing `FormData` code is reused)

- [ ] Step 1: Move `.legacy` from `Shell` to routes; verify every route looks exactly as before (Playwright smoke, 390 and 1280).
- [ ] Step 2: Add the four UI primitives (shadcn style, `cn()`), then the two thin wrappers.
- [ ] Step 3: Build, lint, tests, Playwright dialog check (focus trapped and returned, Esc closes, bottom anchored at 390).
- [ ] Step 4: Commit `feat(frontend): kit for screen redesign (badge, select, textarea, dialog)`.

### Task 1: identity/account — review only
**Files:** `src/app/AuthPage.tsx` (touch only if it needs the kit's error pattern; otherwise no change).
- [ ] Confirm `/login` and `/register` match the principles (error `role="alert"`, 16px inputs, 44px targets) at 320/390/1280, light/dark, EN/BM.
- [ ] Note in the traceability update (Task 11) that password change is part 3. No commit if nothing changes.

### Task 2: tenancy
**Files:** `src/features/tenancy/OrganisationsPanel.tsx` (`LifecyclePanel`), `src/app/OrgPages.tsx` (`OrgHome`, `OrgMore`, `MyOrganisations`, `OrgSettings`), `src/app/OrgLayout.tsx` (only error/loading markup), `src/i18n/*`.
- [ ] Org cards: name (wrap), status `Badge`, "owner" badge, whole card is the link.
- [ ] Create organisation: "New organisation" button → `FormDialog` (existing `createOrganisation` + navigate). Keep the "only if you own none" rule.
- [ ] Org home: header card (name, status, owner), `SubscriptionPanel` slot, links as a row list with chevrons.
- [ ] Settings: profile form card (existing fields and `name`s); lifecycle card with status badge and the existing actions; destructive ones (whichever exist today) behind `ConfirmDialog`.
- [ ] Definition of Done checklist. Commit `feat(frontend): redesign tenancy screens`.

### Task 3: rbac (members)
**Files:** `src/features/rbac/MembersPanel.tsx`, `src/i18n/*`.
- [ ] Member rows: name (wrap), role `Badge`, "you" marker; role change via `Select` where permitted today; remove via `ConfirmDialog`.
- [ ] Leave organisation: destructive card at the bottom with `ConfirmDialog`; `onLeft` unchanged.
- [ ] Definition of Done, including a user without member-management permission. Commit.

### Task 4: public (discover, feed, visibility)
**Files:** `src/features/public/PublicPanels.tsx` (split into one file per panel only if that keeps each under ~150 lines), `src/i18n/*`.
- [ ] Discover: search card (query + type `Select`; filters stack on phones), results as cards, empty state; public org page with cover/logo header (images keep current URLs and alt text), follow control unchanged.
- [ ] Feed: rows with org name, title, date.
- [ ] Visibility: `Select` + logo/cover pickers as styled labels (`<input type="file">` kept, accept list unchanged, ADR-020) with current-image preview and upload error text.
- [ ] Definition of Done, plus an unauthenticated visit to `/`. Commit.

### Task 5: hub
**Files:** `src/features/hub/HubPanel.tsx`, `src/i18n/*`.
- [ ] Announcements and events as card lists (title, body clamp with expand, date chip, state `Badge` per ADR-021 lifecycle).
- [ ] "New announcement" / "New event" → `FormDialog` with the existing handlers; hidden without the existing permission.
- [ ] Definition of Done. Commit.

### Task 6: operations
**Files:** `src/features/operations/OperationsPanel.tsx`, `src/i18n/*`.
- [ ] Tasks: row (title, assignee, due), status `Select` calling the existing `setTaskStatus`; empty state. No delete (ADR-024).
- [ ] Roster: grouped by date, rows with member and slot; create via `FormDialog`.
- [ ] Definition of Done. Commit.

### Task 7a: finance — read side
**Files:** `src/features/finance/FinancePanel.tsx` (extract list and summary into sibling files so each stays small), `src/features/finance/stateBadge.ts` + `stateBadge.test.ts`, `src/i18n/*`.
- [ ] `stateBadge()` pure mapping from transaction/void state (ADR-022) to variant + label key, with a test covering every enum value.
- [ ] Summary card, kind switch as segmented buttons (`aria-pressed`), transaction rows (category, note, amount via the existing money formatter, state badge), empty state.
- [ ] Screenshots with zero, very large and long-note transactions.
- [ ] Definition of Done (read-only parts). Commit.

### Task 7b: finance — forms and dialogs
**Files:** same module.
- [ ] New transaction → `FormDialog` (existing handler, `name`s, category/collection `Select`, receipt file input per ADR-020).
- [ ] Void request: replace `prompt()` with `FormDialog` + required `Textarea`; submit the same trimmed reason to the same API; cancel path sends nothing.
- [ ] Approve/reject and other state actions keep their permission checks; destructive ones behind `ConfirmDialog`.
- [ ] Collections / budgets cards.
- [ ] Definition of Done, plus a full state-machine walk (create → submit → approve → void request) before and after, and a user with `finance.read` only. Commit. Product-owner phone check.

### Task 8: islamic
**Files:** `src/features/islamic/IslamicPanel.tsx`, `src/i18n/*`.
- [ ] Zone `Select`, prayer times list with the next prayer highlighted (existing computation; no new logic), Hijri date line, Qibla bearing number plus arrow (static when reduced motion). Zone/source per ADR-023.
- [ ] Definition of Done on `/` signed out and signed in. Commit.

### Task 9: notifications
**Files:** `src/features/notifications/NotificationsPanel.tsx`, `src/i18n/*`.
- [ ] Rows: unread dot + bold title, organisation name, time; per-row "mark read" and header "mark all read" (existing calls); empty state. Text stays plain React text (no HTML).
- [ ] Definition of Done. Commit.

### Task 10: subscriptions
**Files:** `src/features/subscriptions/SubscriptionPanel.tsx`, `src/i18n/*`.
- [ ] Card with plan name, status `Badge`, trial-days-left; still renders nothing on 403 and shows an error otherwise.
- [ ] Definition of Done on an org home with and without `billing.read`. Commit.

### Task 11: close
**Files:** `src/index.css` (delete `.legacy` block), `src/app/*` (remove remaining wrappers), `docs/REQUIREMENTS_TRACEABILITY.md`.
- [ ] `grep -rn legacy src` returns nothing.
- [ ] Full Playwright run over all routes at 320/390/1280, light/dark, EN/BM; Lighthouse accessibility on `/`, `/feed`, an org finance page.
- [ ] Update traceability (ADR-028 part 2 done; part 3 next). Product-owner real-phone checklist (safe areas, tap feel, dialogs above the keyboard, no input zoom).
- [ ] Final `ecc:react-reviewer` over the whole diff; fix; commit; open PR.

## Review Focus
1. **Dialog on a phone with the keyboard open:** the form stays reachable (`interactive-widget=resizes-content` already set; submit button not covered) — Tasks 0, 7b.
2. **`FormData` regressions:** a renamed or removed `name` silently posts empty fields — every form task.
3. **Finance void reason** trimmed and required exactly as before; cancel sends nothing — Task 7b.
4. **Permission-less users** never see controls, and a forced call still gets 403 — every task.
5. **BM text length** does not break rows or buttons at 320px — every task.
