import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler, notFound } from "./errors.ts";
import { identityRouter } from "./modules/identity/identity.routes.ts";
import { platformRouter } from "./modules/tenancy/platform.routes.ts";
import { rbacRouter } from "./modules/rbac/rbac.routes.ts";
import { tenancyRouter } from "./modules/tenancy/tenancy.routes.ts";

export const app = express();

app.disable("x-powered-by");

// TRUST_PROXY: hop count (e.g. "1") or comma-separated IPs/CIDRs/names ("loopback, 10.0.0.0/8").
// Unset = off, so client-supplied X-Forwarded-For is ignored and rate limits key on the socket IP.
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(identityRouter);
app.use(tenancyRouter);
app.use(rbacRouter);
app.use(platformRouter);

app.use(notFound);
app.use(errorHandler);
