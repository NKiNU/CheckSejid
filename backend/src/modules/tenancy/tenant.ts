import type { RequestHandler } from "express";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";

declare global {
  namespace Express {
    interface Request {
      // Set by requireTenant from the database, never from client input (TENANT-003/004, AUTH-008).
      tenant?: { organisationId: string; membershipId: string };
    }
  }
}

// One response for unknown, malformed and foreign organisations, so ids cannot be probed.
export const orgNotFound = () => new HttpError(404, "ORGANISATION_NOT_FOUND", "Organisation not found");

const uuid = z.uuid();

// Use after requireAuth on routes mounted at "/orgs/:orgId". The route param is only an
// identifier (TENANT-004): access is proven by a membership row, looked up on every request.
export const requireTenant: RequestHandler = async (req, _res, next) => {
  const orgId = req.params["orgId"];
  if (!req.auth || typeof orgId !== "string" || !uuid.safeParse(orgId).success) return next(orgNotFound());
  const membership = await prisma.organisationMembership.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId: req.auth.userId } },
    select: { id: true, organisationId: true },
  });
  if (!membership) return next(orgNotFound());
  req.tenant = { organisationId: membership.organisationId, membershipId: membership.id };
  next();
};

// Models that are not owned by a tenant. Every other model is treated as tenant-owned and
// MUST have an `organisationId` column (TENANT-008) — fail closed: a model missing from this
// list without that column errors instead of silently running unscoped.
const GLOBAL_MODELS = new Set<Prisma.ModelName>(["User", "RefreshToken", "Organisation"]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

function crossTenant(model: string): never {
  throw new Error(`forTenant: cross-tenant organisationId on ${model}`);
}

// Stamps organisationId onto each data object; a different one is a cross-tenant write (TENANT-006).
function stamp(data: unknown, organisationId: string, model: string, required: boolean): unknown {
  if (Array.isArray(data)) return data.map((d) => stamp(d, organisationId, model, required));
  const d = (data ?? {}) as Record<string, unknown>;
  if ("organisationId" in d && d["organisationId"] !== organisationId) crossTenant(model);
  return required ? { ...d, organisationId } : d;
}

// The tenant-scoped data-access path (ADR-008). Feature code for tenant-owned models uses
//   const db = forTenant(req.tenant!.organisationId)
// which adds organisationId to every where (including unique lookups, so guessed foreign ids
// find nothing) and to every created row. Limits: nested relation writes and raw SQL are not
// scoped — check referenced ids with a scoped lookup first (TENANT-006).
export function forTenant(organisationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model as Prisma.ModelName)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;
          if (WHERE_OPS.has(operation)) {
            a["where"] = { ...(a["where"] as object), organisationId };
            if ("data" in a) stamp(a["data"], organisationId, model, false);
          } else if (!CREATE_OPS.has(operation)) {
            throw new Error(`forTenant: unsupported operation ${model}.${operation}`);
          }
          if (operation === "upsert") {
            a["create"] = stamp(a["create"], organisationId, model, true);
            stamp(a["update"], organisationId, model, false);
          }
          if (CREATE_OPS.has(operation)) a["data"] = stamp(a["data"], organisationId, model, true);
          return query(a as typeof args);
        },
      },
    },
  });
}
