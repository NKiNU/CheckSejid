-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('DRAFT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('masjid', 'surau', 'madrasah', 'school', 'ngo', 'other');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "links" JSONB,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "OrganisationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" "OrganisationType";

-- ADR-016: organisations that exist now (development data) are ACTIVE; new ones start as DRAFT.
ALTER TABLE "Organisation" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
