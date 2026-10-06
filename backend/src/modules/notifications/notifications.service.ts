// In-app notifications (ADR-017, NOTIF-001..005). No event bus or channel abstraction: in-app is the
// only channel (NOTIF-002) and call sites invoke notify() directly.
import type { Prisma } from "../../../generated/prisma/client.ts";
import { forTenant } from "../tenancy/tenant.ts";

// ADR-017 events. member.added (10) and subscription.changed (11) are emitted; the rest by Phases 06, 07
// and 08 through notify().
export type NotificationType =
  | "member.added"
  | "task.assigned"
  | "roster.assigned"
  | "finance.approval_required"
  | "event.published"
  | "subscription.changed";

export type NotificationEvent = {
  organisationId: string;
  actorUserId: string;
  type: NotificationType;
  // ADR-017 §2: every member receives it, so the title must be non-sensitive: no amounts, finance
  // details or anything that needs a permission to view. Opening the target is permission-checked.
  title: string;
  targetType: string;
  targetId: string;
};

// NOTIF-005: runs in the caller's transaction and does not catch, so a failure fails the whole action.
// Recipients are computed here from memberships, never from client input (ADR-017 §1): every member
// of the organisation except the actor.
export async function notify(tx: Prisma.TransactionClient, event: NotificationEvent) {
  if (!event.title || event.title.length > 300) throw new Error("notify: title must be 1-300 characters");
  // forTenant is used only to stamp organisationId; inbox reads/updates must use the self-scoped
  // visible() helper in notifications.routes.ts, never an org-scoped read (ADR-015 §1, ADR-017 §4).
  const db = forTenant(event.organisationId, tx);
  const members = await db.organisationMembership.findMany({
    where: { userId: { not: event.actorUserId } },
    select: { userId: true },
  });
  const { organisationId: _org, ...row } = event;
  await db.notification.createMany({
    data: members.map((m) => ({ ...row, recipientUserId: m.userId })) as Prisma.NotificationCreateManyInput[], // organisationId stamped by forTenant
  });
}
