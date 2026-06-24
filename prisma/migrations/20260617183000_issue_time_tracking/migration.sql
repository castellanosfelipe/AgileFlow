ALTER TABLE "Issue" ADD COLUMN "timeSpent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Issue" ADD COLUMN "timeRemaining" INTEGER;

UPDATE "Issue"
SET "timeRemaining" = "estimate"
WHERE "estimate" IS NOT NULL;
