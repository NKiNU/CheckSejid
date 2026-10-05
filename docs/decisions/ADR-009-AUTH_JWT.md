# ADR-009-AUTH_JWT

## Status
Accepted

## Decision
Authentication uses JWT access tokens plus rotating refresh tokens.
- Access token: short-lived (~15 minutes), signed server-side, sent as a Bearer token, held in memory by the frontend (not in localStorage).
- Refresh token: opaque random value in an httpOnly, Secure, SameSite cookie scoped to the refresh endpoint; only its hash is stored in the database. It is rotated on every use, and reuse of a rotated token revokes the token family.
- Passwords are hashed with argon2id (AUTH-001).
- Tokens identify the user only. Organisation context, roles and permissions are resolved server-side per request and are never trusted from token claims supplied by the client (TENANT-003/004, AUTH-003).

## Consequence
- Logout and password change revoke refresh tokens.
- Login and refresh endpoints are rate limited.
- Signing secrets are provided through environment configuration, never committed.
