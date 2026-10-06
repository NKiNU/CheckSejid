-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "PlatformAuditLog" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "Plan" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entitlements" JSONB NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "planKey" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organisationId_key" ON "Subscription"("organisationId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planKey_fkey" FOREIGN KEY ("planKey") REFERENCES "Plan"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-018 §1: plans are commercial configuration (SAAS-005). These defaults are edited in the
-- database, never in code. A key absent from a plan is denied; a null quota is unlimited.
INSERT INTO "Plan" ("key", "name", "entitlements") VALUES
  ('free',         'Free',         '{"operations": false, "finance": false, "finance.reporting": false, "members.max": 5}'),
  ('starter',      'Starter',      '{"operations": true,  "finance": true,  "finance.reporting": false, "members.max": 25}'),
  ('professional', 'Professional', '{"operations": true,  "finance": true,  "finance.reporting": true,  "members.max": null}');

-- ADR-018 §2: every existing organisation starts the same 30-day Professional trial as a new one.
INSERT INTO "Subscription" ("id", "organisationId", "planKey", "status", "trialEndsAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'professional', 'TRIAL', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP
FROM "Organisation";
