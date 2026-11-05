-- ADR-033: images on hub posts and events (HUB-007). Files live in the public Space; rows are tenant-owned.
-- CreateTable
CREATE TABLE "HubImage" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "postId" UUID,
    "eventId" UUID,
    "objectKey" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubImage_postId_idx" ON "HubImage"("postId");

-- CreateIndex
CREATE INDEX "HubImage_eventId_idx" ON "HubImage"("eventId");

-- CreateIndex
CREATE INDEX "HubImage_organisationId_idx" ON "HubImage"("organisationId");

-- AddForeignKey
ALTER TABLE "HubImage" ADD CONSTRAINT "HubImage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubImage" ADD CONSTRAINT "HubImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubImage" ADD CONSTRAINT "HubImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written (ADR-033 §2–3): an image belongs to exactly one post or one event,
-- and an item has at most one main photo. The service enforces both under a row lock; these make them hold for any writer.
ALTER TABLE "HubImage" ADD CONSTRAINT "hub_image_one_parent" CHECK (("postId" IS NULL) <> ("eventId" IS NULL));
CREATE UNIQUE INDEX "HubImage_one_main_per_post" ON "HubImage" ("postId") WHERE "isMain" AND "postId" IS NOT NULL;
CREATE UNIQUE INDEX "HubImage_one_main_per_event" ON "HubImage" ("eventId") WHERE "isMain" AND "eventId" IS NOT NULL;
