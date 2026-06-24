CREATE TABLE "IssueWorklog" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "timeSpent" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueWorklog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueWorklog_issueId_idx" ON "IssueWorklog"("issueId");
CREATE INDEX "IssueWorklog_authorId_idx" ON "IssueWorklog"("authorId");
CREATE INDEX "IssueWorklog_createdAt_idx" ON "IssueWorklog"("createdAt");

ALTER TABLE "IssueWorklog"
ADD CONSTRAINT "IssueWorklog_issueId_fkey"
FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueWorklog"
ADD CONSTRAINT "IssueWorklog_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "IssueWorklog" (
    "id",
    "issueId",
    "authorId",
    "timeSpent",
    "description",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('backfill_', "id"),
    "id",
    "reporterId",
    "timeSpent",
    COALESCE(NULLIF("timeSpentDescription", ''), 'Registro inicial de tiempo'),
    "createdAt",
    "updatedAt"
FROM "Issue"
WHERE "timeSpent" > 0;

UPDATE "Issue"
SET "timeRemaining" = CASE
    WHEN "estimate" IS NULL THEN NULL
    ELSE GREATEST("estimate" - "timeSpent", 0)
END
WHERE "estimate" IS NOT NULL OR "timeSpent" > 0;
