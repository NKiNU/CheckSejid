# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single stacked page with a routed, mobile-first app shell (Tailwind v4 + shadcn/ui + react-router) in the "calm & trustworthy" look, with a redesigned login/register screen and every existing panel mounted unchanged on its own route.

**Architecture:** `src/app/` owns the router, session context, shell and `Nav`. Routes render existing feature panels inside the shell; org routes share one `OrgLayout` that loads the organisation and my permissions once and passes them through router outlet context. Styling is shadcn CSS variables in `src/index.css`; legacy panels get a minimal `.legacy` base style until part 2 redesigns them.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (button, input, label, card; lucide-react icons), react-router v7, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-frontend-foundation-design.md` (decision: `docs/decisions/ADR-028-FRONTEND_UI_FOUNDATION.md`).

## Global Constraints

- All UI text goes through `useT()`; every new key is added to both `src/i18n/en.ts` and `src/i18n/ms.ts` (parity test in `src/i18n/i18n.test.ts` must pass).
- Access token stays in memory only (`features/identity/api.ts`); never `localStorage`.
- Nav hiding is display only; the server enforces. No new client-side permission logic beyond hiding/not rendering.
- Primary colour ≈ `oklch(0.45 0.09 160)`; `--radius: 0.75rem`; cards use shadow, not border; system font stack.
- `--ease-out: cubic-bezier(0.23,1,0.32,1)`; pressables `transition: transform 160ms var(--ease-out)` and `scale: 0.97` on `:active`; no transforms under `prefers-reduced-motion: reduce`.
- Never `user-scalable=no` / `maximum-scale`; inputs ≥16px; no ungated `:hover` CSS (Tailwind v4 `hover:` is already gated).
- New dependencies limited to: `tailwindcss`, `@tailwindcss/vite`, `react-router`, and whatever `shadcn add button input label card` installs.
- Component tests use pure functions only (no jsdom/testing-library added); DOM behaviour is checked with the Playwright MCP in Task 5.
- Run commands from `frontend/`. Commit on `feature/frontend-foundation`; end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reload on a deep link while signed in** (`/org/x/finance`, F5): must wait for session bootstrap, not flash-redirect to `/login`. → Task 2 `RequireAuth` renders loading while `status === 'loading'`; checked in Task 5.
2. **Open redirect via `?next=`**: `next=//evil.example` or `next=https://evil.example` must land on `/feed`. → Task 2 `safeNext` test.
3. **Org the user can no longer open** (left, removed, bad id): `/org/:orgId` shows the API error and a way back, not a blank screen. → Task 4 Step 1; checked in Task 5.
4. **Long org name / display name**: truncates, never pushes nav off-screen or causes horizontal scroll at 320px. → Task 3 `truncate min-w-0`; checked in Task 5.
5. **Leaving an org from Members**: navigates to `/feed`, and the org list no longer shows it. → Task 4 Step 3; checked in Task 5.

---

### Task 1: Tooling, tokens and mobile baseline

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `src/index.css` (full replace)
- Create (shadcn CLI): `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,input,label,card}.tsx`

**Interfaces:**
- Produces: `@/` alias → `src/`; `cn()` from `@/lib/utils`; `Button`, `Input`, `Label`, `Card`/`CardHeader`/`CardTitle`/`CardContent`; Tailwind colours `background`, `foreground`, `card`, `muted`, `muted-foreground`, `primary`, `primary-foreground`, `destructive`, `border`, `ring`; class `.legacy` for unredesigned panels.

- [ ] **Step 1:** `npm install tailwindcss @tailwindcss/vite react-router`. In `vite.config.ts` add `tailwindcss()` to plugins (keep the proxy block) and `resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } }`. Add `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }` to `compilerOptions` in `tsconfig.json` and `tsconfig.app.json`.
- [ ] **Step 2:** `npx shadcn@latest init` (base colour stone, CSS variables) then `npx shadcn@latest add button input label card`. Expected: `components.json`, `src/lib/utils.ts`, four files in `src/components/ui/`.
- [ ] **Step 3: Replace `src/index.css`:** `@import "tailwindcss";`, shadcn's `@theme inline` mapping, `:root` tokens (warm stone neutrals, `--primary: oklch(0.45 0.09 160)`, `--radius: 0.75rem`, `--ease-out`), dark tokens under `@media (prefers-color-scheme: dark)` — delete the `@custom-variant dark` / `.dark` block shadcn generates. Base layer:

```css
@layer base {
  html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
  body { @apply bg-background text-foreground antialiased; overscroll-behavior: none; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  input, textarea, select { font-size: 16px; }
  button, a, [role='button'] { touch-action: manipulation; -webkit-user-select: none; user-select: none; }
  button:not(:disabled), [role='button'] { transition: transform 160ms var(--ease-out); }
  button:not(:disabled):active, [role='button']:active { scale: 0.97; }
  @media (prefers-reduced-motion: reduce) { button:active, [role='button']:active { scale: 1; } }
}
```

`@layer components` `.legacy` rules so old panels stay readable: `h2` `text-xl font-semibold mt-6 mb-3`; `h3` `text-lg font-medium mt-4 mb-2`; `label` block `mb-3`; `input, select, textarea` `w-full max-w-md rounded-md border border-border bg-card px-3 py-2`; `button` `rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50`; `ul` `space-y-2`; `[role=alert]` `text-destructive`; `section` `mb-4 rounded-xl bg-card p-4 shadow-sm`.
- [ ] **Step 4: `index.html`:** viewport `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`; `<meta name="color-scheme" content="light dark">`; two `theme-color` metas with `media="(prefers-color-scheme: light|dark)"`, each the hex of that scheme's `--background`.
- [ ] **Step 5: Verify:** `npm run build && npm run lint && npm test` → all pass.
- [ ] **Step 6: Commit** `feat(frontend): Tailwind v4, shadcn base components, tokens and mobile baseline (ADR-028)`.

### Task 2: Session, router, guard and auth screen

**Files:**
- Create: `src/app/session.tsx`, `src/app/router.tsx`, `src/app/AuthPage.tsx`, `src/app/safeNext.ts`, `src/app/safeNext.test.ts`
- Modify: `src/main.tsx` → `<I18nProvider><SessionProvider><RouterProvider router={router} /></SessionProvider></I18nProvider>`; `src/i18n/en.ts`, `src/i18n/ms.ts`
- Delete: `src/App.tsx`, `src/features/identity/IdentityPage.tsx`

**Interfaces:**
- Consumes: `register`, `login`, `refresh`, `me`, `logout`, `User` from `@/features/identity/api.ts`; Task 1 components.
- Produces:
  - `safeNext(next: string | null): string` — `next` if it starts with `/` and not `//` or `/\`, else `'/feed'`.
  - `useSession(): { status: 'loading' | 'in' | 'out'; user: User | null; signIn(u: User): void; signOut(): Promise<void> }`, `SessionProvider` (bootstraps once: `refresh()` → `me()`; any failure → `out`).
  - `RequireAuth` element: `loading` → centred `t('common.loading')`; `out` → `<Navigate to={'/login?next=' + encodeURIComponent(pathname + search)} replace />`; `in` → `<Outlet />`.
  - `router` (`createBrowserRouter`) exported from `src/app/router.tsx`; Tasks 3–4 add routes.

- [ ] **Step 1: Write the failing test** `src/app/safeNext.test.ts`:

```ts
import { expect, test } from 'vitest'
import { safeNext } from './safeNext.ts'

test('keeps same-origin paths', () => {
  expect(safeNext('/org/abc/finance?x=1')).toBe('/org/abc/finance?x=1')
})
test('rejects anything that could leave the origin', () => {
  for (const bad of [null, '', 'feed', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)'])
    expect(safeNext(bad)).toBe('/feed')
})
```

- [ ] **Step 2:** `npx vitest run src/app/safeNext.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `safeNext`; rerun → PASS.
- [ ] **Step 4:** Implement `session.tsx` and `RequireAuth` (in `router.tsx`). `refresh()` already dedupes concurrent calls, so StrictMode's double effect is safe; do not add a second guard.
- [ ] **Step 5: `AuthPage({ mode }: { mode: 'login' | 'register' })`** on `/login` and `/register`; if `status === 'in'` → `<Navigate to="/feed" replace />`. Layout: `min-h-dvh` centred column, `max-w-sm`, `t('app.name')` heading, `Card` with the form. Same fields, `autoComplete`, `minLength` (12 on register, 1 on login), `maxLength` and flow as the deleted `AuthForm`: register → login → `me` → `signIn` → `navigate(safeNext(params.get('next')), { replace: true })`. Error in `role="alert"` (`text-destructive`) via `useT().error`. Full-width submit `Button`, disabled while submitting. Switch link is a `Link` to the other route, keeping `?next=`.
- [ ] **Step 6:** i18n keys (en / ms): `app.name` Masyarakat / Masyarakat; `common.notFound` Page not found / Halaman tidak dijumpai; `common.back` Back / Kembali. Reuse existing `auth.*`.
- [ ] **Step 7: Verify:** `npm test && npm run build && npm run lint` pass.
- [ ] **Step 8: Commit** `feat(frontend): router, session bootstrap, auth guard and redesigned login/register`.

### Task 3: Shell, Nav and community routes

**Files:**
- Create: `src/app/Shell.tsx`, `src/app/Nav.tsx`, `src/app/tabs.ts`, `src/app/tabs.test.ts`, `src/app/NotFound.tsx`
- Modify: `src/app/router.tsx`, `src/i18n/en.ts`, `src/i18n/ms.ts`

**Interfaces:**
- Consumes: `useSession`, `RequireAuth`, `router` (Task 2); `DiscoverPanel`, `FeedPanel` (`features/public/PublicPanels.tsx`), `IslamicPanel`, `NotificationsPanel`, `LanguageSwitch` (`i18n/index.tsx`).
- Produces:
  - `type Tab = { to: string; label: Key; icon: LucideIcon; end?: boolean }`
  - `communityTabs(signedIn: boolean): Tab[]` — Discover `/` (end), Feed `/feed` (signed in), Prayer `/#prayer`, Alerts `/notifications` (signed in).
  - `orgTabs(orgId: string, perms: ReadonlySet<string>): Tab[]` — Home `/org/:id` (end), Hub, Finance (needs `finance.read`), Ops (needs `operations.read`), More `/org/:id/more`.
  - `Shell({ tabs, title }: { tabs: Tab[]; title: ReactNode })` renders `<Outlet />`.
  - `NotFound` element.

- [ ] **Step 1: Write the failing test** `src/app/tabs.test.ts`:

```ts
import { expect, test } from 'vitest'
import { communityTabs, orgTabs } from './tabs.ts'

test('org tabs hide Finance and Ops without permission', () => {
  const to = (p: string[]) => orgTabs('o1', new Set(p)).map((t) => t.to)
  expect(to([])).toEqual(['/org/o1', '/org/o1/hub', '/org/o1/more'])
  expect(to(['finance.read', 'operations.read'])).toEqual(['/org/o1', '/org/o1/hub', '/org/o1/finance', '/org/o1/operations', '/org/o1/more'])
})
test('community tabs add Feed and Alerts only when signed in', () => {
  expect(communityTabs(false).map((t) => t.to)).toEqual(['/', '/#prayer'])
  expect(communityTabs(true).map((t) => t.to)).toEqual(['/', '/feed', '/#prayer', '/notifications'])
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `tabs.ts` (lucide icons: `Compass`, `Newspaper`, `Clock`, `Bell`, `House`, `Megaphone`, `Wallet`, `ClipboardList`, `Ellipsis`). Rerun → PASS.
- [ ] **Step 4: `Nav({ tabs })`** — `<nav>` of `NavLink`s (react-router sets `aria-current="page"`). Phone: `fixed inset-x-0 bottom-0`, grid with one column per tab, icon over 12px label, `pb-[env(safe-area-inset-bottom)]`, `bg-card/95 backdrop-blur shadow-[0_-1px_8px_rgb(0_0_0/0.06)]`, active `text-primary`. `lg:`: `lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:flex-col` sidebar, icon left of label, active `bg-primary/10 text-primary rounded-lg`. One component only.
- [ ] **Step 5: `Shell`** — `min-h-dvh lg:flex`. Phone top bar (`sticky top-0 pt-[env(safe-area-inset-top)]`, `bg-background/95 backdrop-blur`): `title` in `truncate min-w-0`, `LanguageSwitch`, and when signed in a log-out icon button (`aria-label={t('auth.logOut')}`) → `signOut()` then `navigate('/')`; signed out → `Link` to `/login`. On `lg:` the same items sit in the sidebar header/footer. Content: `<main className="legacy mx-auto w-full max-w-3xl px-4 pb-24 lg:pb-8"><Outlet /></main>`.
- [ ] **Step 6: Community routes** under `<Shell tabs={communityTabs(status === 'in')} title={t('app.name')} />`: `/` → `<DiscoverPanel />` + `<div id="prayer" className="scroll-mt-20"><IslamicPanel /></div>`; inside `RequireAuth`: `/feed` → `FeedPanel`, `/notifications` → `NotificationsPanel`; `*` → `NotFound` (heading `common.notFound`, `Link` to `/` labelled `common.back`).
- [ ] **Step 7:** i18n keys (en / ms): `nav.discover` Discover / Teroka; `nav.feed` Feed / Suapan; `nav.prayer` Prayer / Solat; `nav.alerts` Alerts / Notifikasi; `nav.home` Home / Utama; `nav.hub` Hub / Hab; `nav.finance` Finance / Kewangan; `nav.ops` Ops / Operasi; `nav.more` More / Lagi; `nav.members` Members / Ahli; `nav.settings` Settings / Tetapan; `nav.community` Community / Komuniti; `nav.myOrgs` My organisations / Organisasi saya.
- [ ] **Step 8: Verify:** `npm test && npm run build && npm run lint`. **Commit** `feat(frontend): app shell, responsive nav and community routes`.

### Task 4: Org routes

**Files:**
- Create: `src/app/OrgLayout.tsx`, `src/app/OrgPages.tsx`
- Modify: `src/app/router.tsx`; `src/features/tenancy/OrganisationsPanel.tsx` (export `LifecyclePanel`, delete `OrganisationsPanel` and `ModulesPanel`); `src/i18n/en.ts`, `src/i18n/ms.ts` only if a key is missing

**Interfaces:**
- Consumes: `getOrganisation`, `listMyOrganisations`, `createOrganisation`, `Organisation` (`features/tenancy/api.ts`); `myPermissions` (`features/rbac/api.ts`); `Shell`, `orgTabs`, `NotFound` (Task 3); `useSession` (Task 2); panels `HubPanel`, `FinancePanel`, `OperationsPanel`, `MembersPanel`, `SubscriptionPanel`, `VisibilityPanel`, `LifecyclePanel`.
- Produces: `type OrgCtx = { org: Organisation; perms: ReadonlySet<string>; setOrg(o: Organisation): void; usable: boolean }`; `useOrg(): OrgCtx` (wraps `useOutletContext`) exported from `OrgLayout.tsx`.

- [ ] **Step 1: `OrgLayout`** (route `/org/:orgId` inside `RequireAuth`): load `getOrganisation(orgId)` and `myPermissions(orgId)` in parallel, re-run on `orgId` change. Loading → `common.loading`. Error → centred `Card` with `useT().error(e)` and a `Link` to `/feed` (`common.back`), no Shell. Success → `<Shell tabs={orgTabs(org.id, perms)} title={<OrgSwitcher current={org} />} />` providing `OrgCtx` as outlet context. `usable` = status is `ACTIVE`, `SUSPENDED` or `ARCHIVED` (copied from `ModulesPanel`).
- [ ] **Step 2: `OrgSwitcher({ current })`** in `OrgLayout.tsx`: native `<select>` (`truncate max-w-[60vw] lg:max-w-full`) of `listMyOrganisations()`, change → `navigate('/org/' + id)`; final option `nav.community` → `/feed`.
- [ ] **Step 3: Pages** in `OrgPages.tsx`, each using `useOrg()`; `myUserId = useSession().user!.id`:
  - `OrgHome` (index): org name, `t('state.' + org.status)`, owner badge (`org.owner`), `<SubscriptionPanel orgId />`, links to Members and Settings.
  - `OrgHub` (`hub`): `usable ? <HubPanel orgId perms /> : null`.
  - `OrgFinance` (`finance`): `usable && perms.has('finance.read') ? <FinancePanel orgId myUserId perms /> : <NotFound />`. `OrgOperations` (`operations`) likewise with `operations.read`.
  - `OrgMembers` (`members`): `<MembersPanel orgId myUserId onLeft={() => navigate('/feed', { replace: true })} />`.
  - `OrgSettings` (`settings`): `<LifecyclePanel org onChange={setOrg} />` + `<VisibilityPanel orgId visibility={org.visibility} canEdit={perms.has('organisation.update') && org.status !== 'SUSPENDED' && org.status !== 'ARCHIVED'} />`.
  - `OrgMore` (`more`): links to Members, Settings, Community (`/feed`).
- [ ] **Step 4: `MyOrganisations`** (in `OrgPages.tsx`, rendered above `FeedPanel` on `/feed`): card titled `nav.myOrgs` listing `listMyOrganisations()` as links to `/org/:id`; the create form (`org.newName`, `org.create`, `maxLength={200}`) shown only when the user owns no org, as today; on success `navigate('/org/' + org.id)`.
- [ ] **Step 5:** Delete `OrganisationsPanel` and `ModulesPanel`; remove unused imports.
- [ ] **Step 6: Verify:** `npm test && npm run build && npm run lint`. **Commit** `feat(frontend): org workspace routes, switcher and permission-filtered tabs`.

### Task 5: End-to-end verification and traceability

**Files:**
- Modify: `docs/REQUIREMENTS_TRACEABILITY.md`

- [ ] **Step 1:** Start Postgres and the backend per `docs/operations/RUNBOOK.md` (dev section; `npx prisma migrate deploy` in `backend/`), then `npm run dev` in `frontend/`. Register a user, create an org, complete onboarding (ACTIVE).
- [ ] **Step 2: Playwright MCP** at 390×844 and 1280×800, light and dark (`browser_emulate_media`): `/`, `/login`, log in, `/feed`, `/notifications`, `/org/:id`, `/hub`, `/finance`, `/operations`, `/members`, `/settings`, `/more`, `/nope`. Screenshots to the scratchpad. Expected: no console errors; bottom tab bar on phone, sidebar on desktop; active tab highlighted; old panels readable.
- [ ] **Step 3: Review Focus checks:** (1) reload `/org/:id/finance` stays there; (2) `/login?next=//evil.example` → `/feed` after login; (3) `/org/does-not-exist` shows the error card; (4) 120-char display and org names at 320×640: no horizontal scroll; (5) as a non-owner member, leave from Members → `/feed`, org gone from the list.
- [ ] **Step 4:** Final `npm test && npm run build && npm run lint`; `git diff --stat feature/mvp-password-change -- ../backend` is empty.
- [ ] **Step 5:** In `REQUIREMENTS_TRACEABILITY.md`, append to the LOC-001 row's evidence: "UI shell and nav strings in `src/app/` (ADR-028)". Add no new requirement IDs.
- [ ] **Step 6: Commit** `docs: traceability for ADR-028 frontend foundation`. Real-phone checks for the product owner go in the PR description: safe areas top and bottom, no grey tap flash, no zoom on input focus, tab bar clear of the home indicator, status bar colour in light and dark.
