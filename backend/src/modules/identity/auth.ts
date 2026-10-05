import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { jwtVerify, SignJWT } from "jose";
import { HttpError } from "../../errors.ts";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth. Identifies the user only (ADR-009): organisation, roles and
      // permissions are resolved server-side by later phases, never read from the token.
      auth?: { userId: string };
    }
  }
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // ADR-009

export function accessSecret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_ACCESS_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(s);
}

export function signAccessToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(accessSecret());
}

// Opaque, high-entropy refresh token; only its SHA-256 is persisted (ADR-009).
// A fast hash is fine here because the input is 256 random bits, not a password.
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const unauthenticated = () => new HttpError(401, "UNAUTHENTICATED", "Authentication required");

// AUTH-002: every protected endpoint uses this. Reusable by later phases.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) return next(unauthenticated());
  const key = accessSecret(); // outside try: a missing secret is a 500, not a 401
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return next(unauthenticated());
    req.auth = { userId: payload.sub };
    next();
  } catch {
    next(unauthenticated());
  }
};
