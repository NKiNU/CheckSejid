import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { hashRefreshToken, newRefreshToken, signAccessToken } from "./auth.ts";

// SPEC-GAP: no refresh-token lifetime is specified. Conservative choice: an absolute
// 7-day session — rotation keeps the family's original expiry instead of extending it.
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const publicUser = { id: true, email: true, displayName: true, createdAt: true } as const;

// Verified against when the email is unknown, so login timing does not reveal account existence.
const dummyHash = argon2.hash("timing-equaliser", { type: argon2.argon2id });

const invalidCredentials = () => new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
const unauthenticated = () => new HttpError(401, "UNAUTHENTICATED", "Authentication required");

export async function register(input: { email: string; password: string; displayName: string }) {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id }); // AUTH-001
  try {
    return await prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.displayName },
      select: publicUser,
    });
  } catch (e) {
    // SPEC-GAP: no rule on account enumeration at registration; 409 is reported explicitly.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw e;
  }
}

async function issueRefreshToken(userId: string, familyId: string, expiresAt: Date, tx: Prisma.TransactionClient = prisma) {
  const token = newRefreshToken();
  await tx.refreshToken.create({ data: { userId, familyId, tokenHash: hashRefreshToken(token), expiresAt } });
  return token;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !ok) throw invalidCredentials();
  const refreshToken = await issueRefreshToken(user.id, randomUUID(), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  return { accessToken: await signAccessToken(user.id), refreshToken };
}

// Every refresh/revoke of a family runs in a transaction that first locks the family's rows.
// This serialises them: a revoke waits for an in-flight rotation to commit, and its UPDATE
// (a new statement, so a new READ COMMITTED snapshot) then also sees the newly issued token.
// A rotation that waited on a revoke re-reads its row afterwards and sees revokedAt.
async function lockFamily(tx: Prisma.TransactionClient, familyId: string) {
  await tx.$queryRaw`SELECT id FROM "RefreshToken" WHERE "familyId" = ${familyId}::uuid FOR UPDATE`;
}

function revokeFamilyTx(tx: Prisma.TransactionClient, familyId: string) {
  return tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function revokeFamily(familyId: string) {
  return prisma.$transaction(async (tx) => {
    await lockFamily(tx, familyId);
    await revokeFamilyTx(tx, familyId);
  });
}

export async function refresh(token: string) {
  const found = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(token) } });
  if (!found) throw unauthenticated();

  const next = await prisma.$transaction(async (tx) => {
    await lockFamily(tx, found.familyId);
    // Re-read under the lock: state may have changed while we waited.
    const current = await tx.refreshToken.findUniqueOrThrow({ where: { id: found.id } });
    if (current.revokedAt) return null;
    if (current.rotatedAt) {
      // Reuse of an already-rotated token: assume theft, kill the whole session family.
      await revokeFamilyTx(tx, current.familyId);
      return null;
    }
    if (current.expiresAt <= new Date()) return null;
    await tx.refreshToken.update({ where: { id: current.id }, data: { rotatedAt: new Date() } });
    return issueRefreshToken(current.userId, current.familyId, current.expiresAt, tx);
  });
  if (!next) throw unauthenticated();
  return { accessToken: await signAccessToken(found.userId), refreshToken: next };
}

// Revokes the session (token family) the presented refresh token belongs to. Idempotent.
export async function logout(token: string | undefined) {
  if (!token) return;
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(token) } });
  if (current) await revokeFamily(current.familyId);
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  if (!user) throw unauthenticated();
  return user;
}
