import { Router, type CookieOptions, type Response } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../../errors.ts";
import { requireAuth } from "./auth.ts";
import * as identity from "./identity.service.ts";

export const REFRESH_COOKIE = "refresh_token";

// SPEC-GAP: ADR-009 scopes the cookie to "the refresh endpoint", but logout must also
// read it to revoke the session. Both live under /auth/session, and the cookie is scoped
// to exactly that path, so it is never sent to any other endpoint.
const SESSION_PATH = "/auth/session";
const cookieOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: "strict", path: SESSION_PATH };

// SPEC-GAP: ADR-009 requires rate limiting on login/refresh but sets no numbers.
// Per-client-IP, in-memory (single instance). Behind a proxy, `trust proxy` must be configured.
// ponytail: in-memory store, move to a shared store (e.g. Postgres/Redis) when running >1 instance.
export const rateLimitStores = { credentials: new MemoryStore(), refresh: new MemoryStore() };
const limiter = (limit: number, store: MemoryStore) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    store,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "RATE_LIMITED", "Too many requests, try again later")),
  });
const credentialsLimit = limiter(10, rateLimitStores.credentials);
const refreshLimit = limiter(60, rateLimitStores.refresh);

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// SPEC-GAP: no password policy specified. Conservative: 12–128 chars (upper bound caps hashing cost).
const registerBody = z.object({
  email,
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
});
const loginBody = z.object({ email, password: z.string().min(1).max(128) });

function sendSession(res: Response, session: { accessToken: string; refreshToken: string }) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions,
    maxAge: identity.REFRESH_TOKEN_TTL_MS,
  });
  // The refresh token is only ever in the httpOnly cookie, never in the body.
  res.json({ accessToken: session.accessToken });
}

function refreshCookie(cookies: unknown): string | undefined {
  const v = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof v === "string" && v ? v : undefined;
}

export const identityRouter = Router();

identityRouter.post("/auth/register", credentialsLimit, async (req, res) => {
  const user = await identity.register(registerBody.parse(req.body));
  res.status(201).json({ user });
});

identityRouter.post("/auth/login", credentialsLimit, async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  sendSession(res, await identity.login(email, password));
});

identityRouter.post(`${SESSION_PATH}/refresh`, refreshLimit, async (req, res) => {
  const token = refreshCookie(req.cookies);
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
  try {
    sendSession(res, await identity.refresh(token));
  } catch (e) {
    if (e instanceof HttpError) res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw e;
  }
});

identityRouter.post(`${SESSION_PATH}/logout`, async (req, res) => {
  await identity.logout(refreshCookie(req.cookies));
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

identityRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await identity.getUser(req.auth!.userId) });
});
