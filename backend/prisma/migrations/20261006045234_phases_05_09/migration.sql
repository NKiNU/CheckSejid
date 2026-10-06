-- CreateEnum
CREATE TYPE "FinanceState" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'VOID_APPROVED', 'VOID_REJECTED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgrammeStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrganisationVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "visibility" "OrganisationVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "status" "CollectionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "receivedOn" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "collectionId" UUID,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "state" "FinanceState" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "voidRequestedById" UUID,
    "voidRequestedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "copiedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "spentOn" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "payee" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "state" "FinanceState" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "voidRequestedById" UUID,
    "voidRequestedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "copiedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "state" "FinanceState" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "voidRequestedById" UUID,
    "voidRequestedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "copiedFromId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceApproval" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT,
    "selfApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAttachment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerTimeCache" (
    "source" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "times" JSONB NOT NULL,
    "hijri" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerTimeCache_pkey" PRIMARY KEY ("source","zone","date")
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "ProgrammeStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "programmeId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeUserId" UUID,
    "dueDate" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "programmeId" UUID,
    "userId" UUID NOT NULL,
    "duty" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_organisationId_kind_name_key" ON "FinancialCategory"("organisationId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_id_organisationId_key" ON "FinancialCategory"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Collection_organisationId_createdAt_idx" ON "Collection"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_organisationId_key" ON "Collection"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Income_organisationId_state_idx" ON "Income"("organisationId", "state");

-- CreateIndex
CREATE INDEX "Income_organisationId_collectionId_state_idx" ON "Income"("organisationId", "collectionId", "state");

-- CreateIndex
CREATE INDEX "Expense_organisationId_state_idx" ON "Expense"("organisationId", "state");

-- CreateIndex
CREATE INDEX "Expense_organisationId_categoryId_state_spentOn_idx" ON "Expense"("organisationId", "categoryId", "state", "spentOn");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_id_organisationId_key" ON "Expense"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Budget_organisationId_state_idx" ON "Budget"("organisationId", "state");

-- CreateIndex
CREATE INDEX "FinanceApproval_organisationId_recordType_recordId_idx" ON "FinanceApproval"("organisationId", "recordType", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAttachment_objectKey_key" ON "FinanceAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "FinanceAttachment_organisationId_expenseId_idx" ON "FinanceAttachment"("organisationId", "expenseId");

-- CreateIndex
CREATE INDEX "Post_organisationId_status_publishedAt_idx" ON "Post"("organisationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Event_organisationId_status_startsAt_idx" ON "Event"("organisationId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Programme_organisationId_startDate_idx" ON "Programme"("organisationId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Programme_id_organisationId_key" ON "Programme"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Task_organisationId_status_idx" ON "Task"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Task_organisationId_assigneeUserId_idx" ON "Task"("organisationId", "assigneeUserId");

-- CreateIndex
CREATE INDEX "RosterEntry_organisationId_startsAt_idx" ON "RosterEntry"("organisationId", "startsAt");

-- CreateIndex
CREATE INDEX "Follow_organisationId_idx" ON "Follow"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_userId_organisationId_key" ON "Follow"("userId", "organisationId");

-- CreateIndex
CREATE INDEX "Organisation_visibility_status_idx" ON "Organisation"("visibility", "status");

-- AddForeignKey
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_categoryId_organisationId_fkey" FOREIGN KEY ("categoryId", "organisationId") REFERENCES "FinancialCategory"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_collectionId_organisationId_fkey" FOREIGN KEY ("collectionId", "organisationId") REFERENCES "Collection"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_organisationId_fkey" FOREIGN KEY ("categoryId", "organisationId") REFERENCES "FinancialCategory"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_organisationId_fkey" FOREIGN KEY ("categoryId", "organisationId") REFERENCES "FinancialCategory"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceApproval" ADD CONSTRAINT "FinanceApproval_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_expenseId_organisationId_fkey" FOREIGN KEY ("expenseId", "organisationId") REFERENCES "Expense"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_programmeId_organisationId_fkey" FOREIGN KEY ("programmeId", "organisationId") REFERENCES "Programme"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_programmeId_organisationId_fkey" FOREIGN KEY ("programmeId", "organisationId") REFERENCES "Programme"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written below (not generated). Prisma does not manage functions or triggers, so later
-- `migrate dev` runs will not touch these.

-- FIN-015 / ADR-022 §4: the tenant audit trail is append-only. No API writes or edits it, and the
-- database rejects any UPDATE or DELETE, whoever issues it.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

-- ADR-022 §7: amounts are positive minor units up to 10^13 (validated at the API too).
ALTER TABLE "Income" ADD CONSTRAINT "income_amount_range" CHECK ("amount" > 0 AND "amount" <= 10000000000000);
ALTER TABLE "Expense" ADD CONSTRAINT "expense_amount_range" CHECK ("amount" > 0 AND "amount" <= 10000000000000);
ALTER TABLE "Budget" ADD CONSTRAINT "budget_amount_range" CHECK ("amount" > 0 AND "amount" <= 10000000000000);
ALTER TABLE "Collection" ADD CONSTRAINT "collection_target_range" CHECK ("targetAmount" IS NULL OR ("targetAmount" > 0 AND "targetAmount" <= 10000000000000));
