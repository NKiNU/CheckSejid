import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler, notFound } from "./errors.ts";
import { financeRouter } from "./modules/finance/finance.routes.ts";
import { hubRouter } from "./modules/hub/hub.routes.ts";
import { identityRouter } from "./modules/identity/identity.routes.ts";
import { notificationsRouter } from "./modules/notifications/notifications.routes.ts";
import { publicRouter } from "./modules/public/public.routes.ts";
import { operationsRouter } from "./modules/operations/operations.routes.ts";
import { platformRouter } from "./modules/tenancy/platform.routes.ts";
import { rbacRouter } from "./modules/rbac/rbac.routes.ts";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes.ts";
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
app.use(notificationsRouter);
app.use(subscriptionsRouter);
app.use(publicRouter);
app.use(hubRouter);
app.use(operationsRouter);
app.use(financeRouter);

app.use(notFound);
app.use(errorHandler);
