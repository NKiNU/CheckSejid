# ADR-028-FRONTEND_UI_FOUNDATION

## Status
Accepted (2026-10-09) by the product owner.

## Context
- The Phase 00–12 UI is a stack of minimal panels on one page, styled with the Vite starter CSS. It has no routing, no navigation and no design system.
- Most users (community, committee, treasurers on the go) use phones. Treasurers and admins also use desktops.
- Six screens are still missing (finance audit log, programmes, roster edit/cancel, task edit, platform admin console, password change).

## Decision
1. **Three parts, in order:** (1) foundation (tokens, mobile baseline, app shell, routing, shared components, login/register); (2) redesign the existing screens one module at a time; (3) add the six missing screens. Each part has its own spec and plan.
2. **Stack:** Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui components copied into `frontend/src/components/ui/`, and `react-router` for URLs. Components are added only when a screen uses them.
3. **Look: calm and trustworthy.** Warm neutral background, white cards with soft shadows, one deep green primary colour, red only for destructive actions, system font. Light and dark mode follow the device setting. The look stays generic, with no masjid-only styling in generic modules (docs/CLAUDE.md).
4. **Mobile-first.** Bottom tab bar on phones; the same nav becomes a sidebar from 1024px. Mobile baseline: `viewport-fit=cover`, `theme-color` per colour scheme, no tap highlight, no page overscroll, 16px inputs, `touch-action: manipulation`, hover styles only for fine pointers, `100dvh` shell, safe-area padding. Zoom is never disabled.
5. **Motion:** strong ease-out curve, press feedback `scale(0.97)` at 160ms, UI animations under 300ms, nothing on keyboard actions, movement removed under `prefers-reduced-motion`.
6. **Security unchanged:** the UI hides nav items using the permissions and entitlements the server returns; the server remains the only enforcement point.
7. **Existing conventions kept:** each module's `api.ts`, BM/EN via `useT()` (ADR-027), JWT access token in memory with refresh cookie (ADR-009).

## Consequence
New frontend dependencies: `tailwindcss`, `@tailwindcss/vite`, `react-router`, and shadcn's helpers (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix primitives used by added components). The Vite starter CSS is removed.
