# Frontend foundation (part 1 of 3) — design

Decision record: `docs/decisions/ADR-028-FRONTEND_UI_FOUNDATION.md`.

## Goal
Replace the single stacked page with a routed, mobile-first app shell in the new look, without breaking any existing feature. Login/register is the one screen fully redesigned; every other route renders its existing panel unchanged inside the shell (redesigned in part 2).

## Routes

| Route | Renders | Access |
|---|---|---|
| `/` | `DiscoverPanel` + `IslamicPanel` | Public |
| `/login`, `/register` | New auth screen | Public (signed-in users are redirected to `/feed`) |
| `/feed` | `FeedPanel` | Signed in |
| `/notifications` | `NotificationsPanel` | Signed in |
| `/org/:orgId` | Org home: org name and status, `SubscriptionPanel`, links to the org tabs | Member of the org |
| `/org/:orgId/hub` | `HubPanel` | Member |
| `/org/:orgId/finance` | `FinancePanel` | `finance.read` |
| `/org/:orgId/operations` | `OperationsPanel` | `operations.read` |
| `/org/:orgId/members` | `MembersPanel` | Member |
| `/org/:orgId/settings` | Lifecycle/profile + `VisibilityPanel` | Member (edit controls as today) |

Signed-out access to a signed-in route redirects to `/login` and returns to the route after login. Unknown routes show a not-found screen. `/o/:orgId`, `/account` and `/platform` are added with their screens in later parts.

The "usable" rule in `OrganisationsPanel` (suspended/archived orgs hide modules) and its per-module permission checks move to the org routes unchanged. `OrganisationsPanel`'s org list and create form become the org switcher plus a "create organisation" entry.

## Navigation
- One `Nav` component. Phones: fixed bottom tab bar with labelled icons, padded by `env(safe-area-inset-bottom)`. ≥1024px: left sidebar with the org switcher on top.
- Community tabs: Discover · Feed · Prayer (anchor to the prayer section on `/`) · Alerts. Org tabs: Home · Hub · Finance · Ops · More (members, settings, back to community).
- Tabs the user lacks permission for are hidden, using the `perms` the org routes already load. Display only; the server enforces.
- Active tab uses `aria-current="page"`. Language switch and log out live in the top bar (phones) or sidebar footer (desktop).

## Look and tokens
- shadcn CSS variables in `src/index.css` (replacing the Vite starter CSS): warm off-white background, white cards, warm grey text, deep green `--primary` (≈ `oklch(0.45 0.09 160)`), red `--destructive`. Dark values under `@media (prefers-color-scheme: dark)`. Radius 12px; cards use soft shadows, not borders. System font stack.
- Motion tokens: `--ease-out: cubic-bezier(0.23,1,0.32,1)`. Buttons: `transition: transform 160ms var(--ease-out)`, `:active { scale: 0.97 }`. No animation on keyboard-triggered actions; `prefers-reduced-motion` removes transforms.

## Mobile baseline
- `index.html`: `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`; `theme-color` meta for light and dark; `color-scheme: light dark`.
- CSS: `-webkit-tap-highlight-color: transparent`, `-webkit-text-size-adjust: 100%`, `overscroll-behavior: none` on `html, body` (`contain` on inner scrollers); inputs ≥16px; buttons/links `touch-action: manipulation` and `user-select: none`; shell height `100dvh`. Hover styles via Tailwind v4 `hover:` only (already capability-gated). Zoom never disabled.

## Components
Added via the shadcn CLI into `src/components/ui/`: `button`, `input`, `label`, `card`. Own code: `src/app/` (router, shell, `Nav`, auth guard). Sheet, dialog, toast and table are added in part 2 when a screen needs them.

## Auth
Session bootstrap moves from `IdentityPage` to the shell: `api.refresh()` then `api.me()` once on load; the user is held in a small React context. Login/register keep current behaviour (register → login → `me`, 12-char minimum on register, server error shown via `useT().error`). All strings go through `useT()` with ms/en parity.

## Testing
- Vitest: auth form shows the server's error message; `Nav` hides Finance/Ops tabs without `finance.read`/`operations.read`. Existing i18n parity test keeps passing.
- `npm run build` and `npm run lint` clean.
- Playwright at 390×844 and 1280×800: login, open each route, screenshots in light and dark.
- Real phone checklist for the product owner: safe areas, tap feel, no input zoom, tab bar above the home indicator, status bar colour.

## Out of scope
Redesigning existing panels (part 2); the six missing screens and their routes (part 3); PWA/install; theme toggle; web fonts.
