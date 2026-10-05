import type { RequestHandler } from "express";
import { z } from "zod";
import { Prisma } from "../../../generated/prisma/client.ts";
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

// ---------------------------------------------------------------------------------------------
// forTenant — the tenant-scoped data-access path (ADR-008). FAIL-CLOSED by construction:
//  - Only tenant-owned models (those with an `organisationId` scalar, TENANT-008) are reachable.
//    Global models (User, RefreshToken, Organisation) throw: use plain `prisma` for them, explicitly.
//  - No `$` methods ($queryRaw, $executeRaw, $transaction, ...): they do not exist on the object.
//  - Every where gets `organisationId` (overriding any client value, so OR/undefined tricks and
//    guessed foreign ids find nothing); every created row is stamped; a different organisationId
//    in data throws (TENANT-006).
//  - Only scalar fields may appear in where/data/select/omit/orderBy/etc. Relation keys
//    (connect/create/nested filters), `include` and unknown arguments throw. Fetch related data
//    with a separate query — forTenant for tenant models, plain `prisma` with an explicit safe
//    `select` for global ones (never passwordHash etc.).
//
//   const db = forTenant(req.tenant!.organisationId);
//   const row = await db.expense.findUnique({ where: { id } }); // null if foreign
//   await prisma.$transaction(async (tx) => { await forTenant(orgId, tx).expense.create({ data }) });
// ---------------------------------------------------------------------------------------------

type Delegates = Omit<Prisma.TransactionClient, `$${string}`>;
type GlobalDelegates = "user" | "refreshToken" | "organisation";
export type TenantDb = Omit<Delegates, GlobalDelegates>;

// Allow-list from Prisma's generated metadata: delegate name → that model's scalar fields.
const SCALARS = new Map<string, Set<string>>();
for (const model of Object.values(Prisma.ModelName)) {
  const fields = new Set(Object.values((Prisma as unknown as Record<string, object>)[`${model}ScalarFieldEnum`]!));
  if (fields.has("organisationId")) SCALARS.set(model[0]!.toLowerCase() + model.slice(1), fields as Set<string>);
}

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

function scopeArgs(model: string, op: string, args: unknown, organisationId: string): Obj {
  const scalars = SCALARS.get(model)!;
  const fail = (msg: string): never => {
    throw new Error(`forTenant(${model}.${op}): ${msg}`);
  };
  const scalar = (k: string) => scalars.has(k) || fail(`only scalar fields are allowed, got "${k}"`);
  // compound unique keys such as organisationId_userId
  const scalarOrCompound = (k: string) => scalars.has(k) || k.split("_").every((p) => scalars.has(p)) || scalar(k);
  const keys = (v: unknown, extra: string[] = []) =>
    list(v).forEach((o) => {
      if (typeof o === "string") return void scalar(o);
      if (!isObj(o)) return void fail("malformed argument");
      Object.keys(o).forEach((k) => extra.includes(k) || scalar(k));
    });
  const where = (w: unknown): void =>
    list(w).forEach((o) => {
      if (!isObj(o)) return void fail("malformed where");
      for (const [k, v] of Object.entries(o)) {
        if (k === "AND" || k === "OR" || k === "NOT") where(v);
        else scalarOrCompound(k);
      }
    });
  const data = (d: unknown) =>
    list(d).forEach((o) => {
      keys(o);
      if (isObj(o) && "organisationId" in o && o["organisationId"] !== organisationId) {
        fail("cross-tenant organisationId");
      }
    });

  if (!WHERE_OPS.has(op) && !CREATE_OPS.has(op)) fail("unsupported operation");
  if (args !== undefined && !isObj(args)) fail("malformed arguments");
  const out: Obj = { ...(args as Obj | undefined) }; // never mutate the caller's object
  for (const [k, v] of Object.entries(out)) {
    switch (k) {
      case "where":
      case "having":
      case "cursor":
        where(v);
        break;
      case "data":
      case "create":
      case "update":
        data(v);
        break;
      case "select":
      case "omit":
      case "orderBy":
      case "distinct":
      case "by":
        keys(v);
        break;
      case "_count":
      case "_sum":
      case "_avg":
      case "_min":
      case "_max":
        if (v !== true) keys(v, ["_all"]);
        break;
      case "take":
      case "skip":
      case "skipDuplicates":
        break;
      default:
        fail(`argument "${k}" is not allowed`); // include, relationLoadStrategy, ...
    }
  }
  const stamp = (d: unknown) => (Array.isArray(d) ? d.map((o) => ({ ...o, organisationId })) : { ...(d as Obj), organisationId });
  if (WHERE_OPS.has(op)) out["where"] = { ...(out["where"] as Obj | undefined), organisationId };
  if (CREATE_OPS.has(op)) out["data"] = stamp(out["data"]);
  if (op === "upsert") out["create"] = stamp(out["create"]);
  return out;
}

export function forTenant(organisationId: string, db: Prisma.TransactionClient = prisma): TenantDb {
  const denied = (what: string): never => {
    throw new Error(`forTenant: "${what}" is not a tenant-owned model; use plain prisma explicitly`);
  };
  return new Proxy({} as TenantDb, {
    get(_t, prop) {
      if (typeof prop !== "string" || prop === "then") return undefined; // not thenable; inspection-safe
      if (!SCALARS.has(prop)) return denied(prop);
      const delegate = (db as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[prop]!;
      return new Proxy(
        {},
        {
          get(_d, op) {
            if (typeof op !== "string" || op === "then") return undefined;
            return (args?: unknown) => {
              let scoped: Obj;
              try {
                scoped = scopeArgs(prop, op, args, organisationId);
              } catch (e) {
                return Promise.reject(e); // same shape as a Prisma error: callers just await
              }
              return delegate[op]!(scoped);
            };
          },
        },
      );
    },
  });
}
