import { Router } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";

// Self-scoped: every row is filtered by the caller's own id, so no permission key (ADR-015 §1).
// SPEC-GAP: no numbers specified. Per user, 15-min window. ponytail: in-memory, as identity's limits.
export const notificationRateLimitStores = { change: new MemoryStore() };
const changeLimit = limiter(60, notificationRateLimitStores.change, (req) => `user:${req.auth!.userId}`);

// SEC-006: bounded page size.
const limit = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().min(1).max(50));
// Keyset cursor "<createdAt ms>_<id>", opaque to clients.
const cursor = z
  .string()
  .max(100)
  .transform((s, ctx) => {
    const [ms, id] = Buffer.from(s, "base64url").toString().split("_");
    const at = new Date(Number(ms));
    if (!ms || !/^\d+$/.test(ms) || Number.isNaN(at.getTime()) || !z.uuid().safeParse(id).success) {
      ctx.issues.push({ code: "custom", message: "Invalid cursor", input: s });
      return z.NEVER;
    }
    return { at, id: id! };
  });
const listQuery = z.strictObject({ limit: limit.default(20), cursor: cursor.optional(), unread: z.enum(["true", "false"]).optional() });
const noBody = z.strictObject({});

// ADR-017 §5: only organisations the user still belongs to. Enforced in every query below.
const visible = (userId: string): Prisma.NotificationWhereInput => ({
  recipientUserId: userId,
  organisation: { memberships: { some: { userId } } },
});

export const notificationsRouter = Router();

notificationsRouter.get("/me/notifications", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const q = listQuery.parse(req.query);
  const unreadOnly: Prisma.NotificationWhereInput = q.unread === "true" ? { readAt: null } : {};
  const after: Prisma.NotificationWhereInput = q.cursor
    ? { OR: [{ createdAt: { lt: q.cursor.at } }, { createdAt: q.cursor.at, id: { lt: q.cursor.id } }] }
    : {};
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { AND: [visible(userId), unreadOnly, after] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      select: {
        id: true,
        organisationId: true,
        organisation: { select: { name: true } },
        type: true,
        title: true,
        targetType: true,
        targetId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { ...visible(userId), readAt: null } }),
  ]);
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  res.json({
    notifications: page.map(({ organisation, ...n }) => ({ ...n, organisationName: organisation.name })),
    nextCursor: rows.length > q.limit && last ? Buffer.from(`${last.createdAt.getTime()}_${last.id}`).toString("base64url") : null,
    unreadCount,
  });
});

// NOTIF-003 / ADR-017 §4. Unknown, malformed, foreign and hidden ids are the same 404; idempotent.
notificationsRouter.post("/me/notifications/:id/read", requireAuth, changeLimit, async (req, res) => {
  noBody.parse(req.body ?? {});
  const userId = req.auth!.userId;
  const id = z.uuid().safeParse(req.params["id"]);
  const found = id.success && (await prisma.notification.findFirst({ where: { id: id.data, ...visible(userId) }, select: { id: true } }));
  if (!found) throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  await prisma.notification.updateMany({ where: { id: found.id, ...visible(userId), readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});

notificationsRouter.post("/me/notifications/read-all", requireAuth, changeLimit, async (req, res) => {
  noBody.parse(req.body ?? {});
  const userId = req.auth!.userId;
  const { count } = await prisma.notification.updateMany({ where: { ...visible(userId), readAt: null }, data: { readAt: new Date() } });
  res.json({ count });
});
