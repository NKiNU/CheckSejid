-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'treasurer', 'committee', 'staff');

-- AlterTable
ALTER TABLE "OrganisationMembership" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MembershipRole" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "targetUserId" UUID,
    "targetOrganisationId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipRole_organisationId_idx" ON "MembershipRole"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRole_membershipId_role_key" ON "MembershipRole"("membershipId", "role");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_id_organisationId_key" ON "OrganisationMembership"("id", "organisationId");

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_membershipId_organisationId_fkey" FOREIGN KEY ("membershipId", "organisationId") REFERENCES "OrganisationMembership"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written below (not generated). Prisma does not manage functions or triggers, so later
-- `migrate diff` runs leave them alone.

-- Data migration: owners need no row (Organisation.ownerId IS the owner role). Existing
-- non-owner members get `staff`, the default role for newly added members, so nobody who had
-- access in Phase 02 loses it.
INSERT INTO "MembershipRole" ("id", "organisationId", "membershipId", "role")
SELECT gen_random_uuid(), m."organisationId", m."id", 'staff'
FROM "OrganisationMembership" m
JOIN "Organisation" o ON o."id" = m."organisationId"
WHERE m."userId" <> o."ownerId";

-- RBAC-008 / ORG-001: the owner is always a member of their organisation. Deferred to commit,
-- so creating an organisation with its owner membership in one transaction, and an ownership
-- transfer, pass; deleting or moving the owner's membership fails.
CREATE FUNCTION "rbac_owner_is_member"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'Organisation' THEN org_id := NEW."id"; ELSE org_id := OLD."organisationId"; END IF;
  IF EXISTS (
    SELECT 1 FROM "Organisation" o
    WHERE o."id" = org_id
      AND NOT EXISTS (
        SELECT 1 FROM "OrganisationMembership" m WHERE m."organisationId" = o."id" AND m."userId" = o."ownerId"
      )
  ) THEN
    RAISE EXCEPTION 'organisation % owner must be a member', org_id USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "organisation_owner_is_member"
  AFTER INSERT OR UPDATE OF "ownerId" ON "Organisation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "rbac_owner_is_member"();

CREATE CONSTRAINT TRIGGER "membership_owner_is_member"
  AFTER DELETE OR UPDATE OF "userId", "organisationId" ON "OrganisationMembership"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "rbac_owner_is_member"();
