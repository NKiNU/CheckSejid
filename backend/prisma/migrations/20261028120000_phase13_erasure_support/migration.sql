-- Phase 13 (ADR-031, ADR-032): erasure and support-access tables, plus hand-written constraints.
-- CreateEnum
CREATE TYPE "ErasureKind" AS ENUM ('USER', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "ErasureStatus" AS ENUM ('PENDING_GRACE', 'CANCELLED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportGrantStatus" AS ENUM ('REQUESTED', 'GRANTED', 'DENIED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ErasureRequest" (
    "id" UUID NOT NULL,
    "kind" "ErasureKind" NOT NULL,
    "subjectId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "status" "ErasureStatus" NOT NULL DEFAULT 'PENDING_GRACE',
    "executeAfter" TIMESTAMP(3) NOT NULL,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ErasureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionSetting" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "years" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveRecord" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "destroyAfter" TIMESTAMP(3) NOT NULL,
    "destroyedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SupportGrantStatus" NOT NULL DEFAULT 'REQUESTED',
    "grantedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErasureRequest_status_executeAfter_idx" ON "ErasureRequest"("status", "executeAfter");

-- CreateIndex
CREATE INDEX "ErasureRequest_kind_subjectId_idx" ON "ErasureRequest"("kind", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionSetting_organisationId_key" ON "RetentionSetting"("organisationId");

-- CreateIndex
CREATE INDEX "ArchiveRecord_destroyAfter_idx" ON "ArchiveRecord"("destroyAfter");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_organisationId_createdAt_idx" ON "SupportAccessGrant"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_adminUserId_organisationId_status_idx" ON "SupportAccessGrant"("adminUserId", "organisationId", "status");


-- Phase 13A (ADR-031). Hand-written; merged into the single Phase 13 migration at merge time, after the
-- tables Prisma generates from erasure.prisma. Safe to run once on a database that has all earlier migrations.

-- ADR-031 §1: the tenant audit trail stays append-only (FIN-015) except inside an organisation erasure,
-- whose transaction runs SET LOCAL app.erasure = 'on'. SET LOCAL ends with the transaction, so no
-- other session or later statement can delete. UPDATE stays blocked always.
CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.erasure', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- ADR-031 §6 / PDPA-002: retention is 1, 3, 5 or 7 years only.
ALTER TABLE "RetentionSetting" ADD CONSTRAINT "retention_years_allowed" CHECK ("years" IN (1, 3, 5, 7));

-- One open request per subject: a second one while PENDING_GRACE or RUNNING is a unique violation (409).
CREATE UNIQUE INDEX "ErasureRequest_open_subject" ON "ErasureRequest" ("kind", "subjectId") WHERE "status" IN ('PENDING_GRACE', 'RUNNING');

-- Not changed on purpose: the Restrict foreign keys (the executor deletes children before the
-- organisation, in registry order) and the owner-is-member triggers (deferred; deleting the memberships
-- and the organisation in one transaction leaves nothing for them to reject).

-- ADR-032 §2 / merge review: at most one open support request per admin and organisation.
CREATE UNIQUE INDEX "SupportAccessGrant_open_request" ON "SupportAccessGrant" ("adminUserId", "organisationId") WHERE "status" IN ('REQUESTED', 'GRANTED');
