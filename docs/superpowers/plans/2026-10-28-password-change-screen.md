# ADR-028 part 3 — password change screen (frontend only)

Backend `POST /auth/password` (AUTH-007) is unchanged. Body `{currentPassword, newPassword}` (new: 12–128 chars).
It revokes every refresh token and returns a **new session** for the caller (new access token in the body,
new refresh cookie). ADR-009 therefore needs no forced re-login: the client keeps the new access token in memory.
A wrong current password returns 401 `INVALID_CREDENTIALS`; the stock message says "email or password", so this form shows its own text.

Decisions (defaults, no ADR needed — no spec change):
- No account area exists yet. Entry = a key icon button beside Log out in the shell header/sidebar, signed-in only, to `/account/password`.
- Route sits under `RequireAuth` (unchanged `?next=` behaviour), inside the community shell.

Tasks
1. `passwordProblem(next, confirm)` pure check (TDD) — length 12–128, match. Server stays authoritative.
2. `api.changePassword` stores the returned access token (TDD).
3. `ChangePassword.tsx` form, route, shell link, ms/en keys.
4. build, lint, vitest; react-reviewer; Playwright pass; traceability hunk as its own commit.
