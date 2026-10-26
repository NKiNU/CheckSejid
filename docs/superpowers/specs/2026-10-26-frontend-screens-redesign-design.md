# Frontend screens redesign (part 2 of 3) — design

Decision record: `docs/decisions/ADR-028-FRONTEND_UI_FOUNDATION.md` (no new ADR needed; see "Decisions to confirm"). Builds on `2026-10-09-frontend-foundation-design.md`.

## Goal
Redesign every existing panel into the ADR-028 look (mobile-first, calm and trustworthy), one module at a time, **without changing behaviour**: same API calls, same permission/entitlement checks, same i18n keys' meaning. After this part no screen depends on the `.legacy` base style, and it is deleted.

## Starting point (verified in the code)
- Part 1 shipped the shell, router, `Nav`, session context, tokens and `AuthPage`. Every other route still renders its old panel inside `<main className="legacy ...">` (`app/Shell.tsx:45`).
- Panels are 30–200 lines each, plain HTML (`h3`, `ul`, bare `button`/`select`), styled only by `.legacy` element rules.
- shadcn `button`, `input`, `label`, `card` exist. `radix-ui`, `class-variance-authority`, `lucide-react` are already dependencies.
- Pain points found: `prompt()` for the finance void reason (`FinancePanel.tsx:40`); status shown as raw text; tasks, roster, members and notifications are bare `<ul>`; file inputs are unstyled; forms are always expanded.
- `identity` has no panel. Its only screen (`AuthPage`) was finished in part 1; the password-change screen is part 3.

## Principles (apply to every module)
1. **Behaviour frozen.** Only markup, classes and component composition change. Handlers, `api.ts`, permission checks, error handling and `perms` props stay as they are. Any needed logic change is called out and gets a test.
2. **One screen = a column of cards.** Each section is a `Card` (shadow, no border). Lists are rows inside a card, not nested cards. Page title is an `h1`, section titles `h2`.
3. **Status is a badge, not a sentence.** One `Badge` with variants `neutral | success | warning | destructive`, mapped from enum values in a pure function per module (tested). Red only for destructive meaning (rejected, void, overdue) and destructive buttons.
4. **Forms.** `Label` + `Input`/`Select`/`Textarea`, full width on phones, 16px text, error text under the form with `role="alert"`, success as inline `role="status"` text. Create forms are hidden behind a primary "New …" button that opens a `Dialog`, which sits at the bottom edge on phones and centred from 640px.
5. **Native selects.** `Select` is a styled native `<select>` (best picker on phones, no Radix select weight).
6. **Destructive and reasoned actions use a dialog.** Destructive buttons open a confirm `Dialog`; the finance void reason becomes a `Dialog` with a required `Textarea` instead of `prompt()`. Same API call, same payload.
7. **Empty, loading, error states exist for every list.** Empty = one muted line plus the primary action where the user may create. Loading = muted text (no skeleton library). Errors = `role="alert"` from `useT().error`.
8. **Touch and reach.** Interactive targets ≥ 44px tall, primary action reachable at the bottom on phones, nothing relies on hover, no horizontal scroll at 320px (long names wrap: `min-w-0 break-words`), money and dates right-aligned and tabular (`tabular-nums`).
9. **Generic modules stay generic.** No masjid-only wording or imagery outside the Islamic module (docs/CLAUDE.md).
10. **Motion** as ADR-028: dialogs fade/translate ≤ 200ms with the ease-out token, none under `prefers-reduced-motion`, none on keyboard-triggered actions.
11. **Accessibility.** Dialog focus trap/return from Radix, visible focus ring, badges never colour-only (text label always), `aria-current` already in `Nav`.

## Shared kit (added only when first used)
`Badge`, `Select`, `Textarea`, `Dialog` (+ `ConfirmDialog`, `FormDialog` thin wrappers) in `src/components/ui/`. No toast library, no table library, no sheet: ADR-028's dependency list stays valid (Radix is already installed through `radix-ui`).

Removing `.legacy`: step 0 moves it from `Shell` onto each unmigrated route element, so a migrated module simply drops the wrapper and cannot inherit the old bare-element rules. The CSS block is deleted when the last module is migrated.

## Modules, in the order the product owner set
| # | Module | Screens (route) | Redesign |
|---|---|---|---|
| 0 | prep | all | `.legacy` per route; `Badge`, `Select`, `Textarea`, `Dialog` |
| 1 | identity/account | `/login`, `/register` | Review against the kit only (done in part 1). Password change = part 3. No other change |
| 2 | tenancy | `/feed` org list + create, `/org/:id` home, `/org/:id/more`, `/org/:id/settings` (profile, lifecycle) | Org cards with status/owner badges; create-org in a dialog; profile form card; lifecycle actions with status badge, archive/suspend (destructive) behind confirm |
| 3 | rbac | `/org/:id/members` | Member rows (name, role badge, "you"), role change via `Select`, remove behind confirm, leave-organisation as destructive card at the bottom |
| 4 | public | `/` discover, public org page, `/feed`, settings visibility | Search card (filters collapse on phones), result cards, public org page with cover/logo header, feed rows, visibility `Select` + styled logo/cover pickers with preview |
| 5 | hub | `/org/:id/hub` | Announcements and events as card lists with date chips; "New" dialogs for create; publish/cancel states as badges |
| 6 | operations | `/org/:id/operations` | Tasks: row with title, assignee, status `Select`/badge; roster: grouped by date; create via dialogs. No delete (ADR-024) |
| 7 | finance | `/org/:id/finance` | Largest. Balance/summary card; transaction rows (category, amount in minor-unit formatting per ADR-011, state badge: draft/submitted/approved/void); kind switch as segmented buttons (`aria-pressed`); new-transaction dialog; receipt picker; void request dialog with required reason; collections and budgets as their own cards |
| 8 | islamic | `/` prayer + Qibla | Zone `Select`, prayer times as a list with the next prayer highlighted, Hijri date line, Qibla bearing as a number plus rotating arrow (static under reduced motion). Source/zone unchanged (ADR-023) |
| 9 | notifications | `/notifications` | Rows with unread dot + bold title, org name, time; "mark all read" in the header; empty state |
| 10 | subscriptions | org home card | Plan, status badge, trial-days-left; hidden on 403 exactly as today |
| 11 | close | all | Delete `.legacy` CSS, full Playwright pass, traceability |

Finance is split into two tasks (read side, then forms and dialogs) because of its size and money risk.

## What stays out
Part 3 screens (finance audit log, programmes, roster edit/cancel, task edit, platform console, password change); new features, new endpoints, PWA, theme toggle, charts, toast/table/sheet libraries.

## Risks and how they are handled
- **Silent behaviour change while re-marking-up forms** (name attributes, `FormData`, controlled selects): keep field `name`s and handlers verbatim; per-module checklist compares the Playwright flow before and after.
- **Money formatting regressions**: no formatting code is rewritten; the existing helper is reused. Finance screenshots include zero, large (≥ 1,000,000.00) and negative-looking values.
- **Hidden `.legacy` inheritance** (a migrated screen still picking up bare-element styles): solved structurally by the per-route wrapper.
- **Worst-case data** (long names, zero items, 500 rows, non-Latin text): checked per module with the `break-ui` skill at 320px.
- **i18n drift**: every new string in `en.ts` and `ms.ts`; the parity test must pass; BM strings are usually longer, so screenshots are taken in BM.

## Testing and verification (per module)
- Vitest: only pure functions (status→badge mappings, any extracted formatters); existing tests untouched and passing. No jsdom added (as part 1).
- `npm run build`, `npm run lint` clean.
- Playwright at 320×700, 390×844, 1280×800, light and dark, EN and BM: open the module's routes, run its main flow (create, change, destructive confirm, cancel path), save screenshots under the scratchpad (not committed).
- Permission check: a user without the permission still cannot see the control, and the API still returns 403 if forced (backend unchanged, UI is display only).
- Product-owner phone checklist after modules 2, 7 and the close.

## Decisions to confirm
1. **`prompt()` → dialog** for the void reason (recommended; same payload). Alternative: leave as is, rejected because `prompt()` is unreliable on phones/PWAs.
2. **No toast library**; inline `role="status"` messages. Keeps ADR-028's dependency list intact. Adding `sonner` would need an ADR-028 amendment.
3. **Sequential, not parallel**: all modules share the kit and `app/` router files, so one branch, one module at a time, one commit group per module, reviewed before the next (the parallel-agent rules in CLAUDE.md do not apply).
4. **Identity module** has nothing to redesign; confirm it is only a review step.
