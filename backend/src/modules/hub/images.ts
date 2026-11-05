// ADR-033: images of hub posts and events. Shared by the hub and the public module.
import { publicUrl } from "../../storage.ts";
import type { TenantDb } from "../tenancy/tenant.ts";

export const MAX_IMAGES = 5;
export type HubImage = { id: string; url: string; isMain: boolean };
export const parentField = (kind: "post" | "event") => (kind === "post" ? "postId" : "eventId");

export const toImage = (i: { id: string; objectKey: string; isMain: boolean }): HubImage => ({ id: i.id, url: publicUrl(i.objectKey)!, isMain: i.isMain });

// One query for a whole page (no N+1), in upload order. `db` is forTenant(...) for tenant reads and the
// plain client for the public lists, whose ids came from an already scoped query.
export async function withImages<T extends { id: string }>(db: Pick<TenantDb, "hubImage">, kind: "post" | "event", rows: T[]) {
  const field = parentField(kind);
  const found = rows.length
    ? await db.hubImage.findMany({
        where: { [field]: { in: rows.map((r) => r.id) } },
        select: { id: true, postId: true, eventId: true, objectKey: true, isMain: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];
  return rows.map((r) => ({ ...r, images: found.filter((i) => i[field] === r.id).map(toImage) }));
}
