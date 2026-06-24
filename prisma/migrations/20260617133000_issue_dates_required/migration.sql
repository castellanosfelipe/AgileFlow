ALTER TABLE "Issue" ADD COLUMN "startDate" TIMESTAMP(3);

UPDATE "Issue"
SET "startDate" = COALESCE("createdAt", CURRENT_TIMESTAMP);

UPDATE "Issue"
SET "dueDate" = COALESCE(
  "dueDate",
  COALESCE("createdAt", CURRENT_TIMESTAMP) + INTERVAL '7 days'
);

ALTER TABLE "Issue" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "Issue" ALTER COLUMN "startDate" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Issue" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "Issue" ALTER COLUMN "dueDate" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Issue_startDate_idx" ON "Issue"("startDate");
CREATE INDEX "Issue_dueDate_idx" ON "Issue"("dueDate");
