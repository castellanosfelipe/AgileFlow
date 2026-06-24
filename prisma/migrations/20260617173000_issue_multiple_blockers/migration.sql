CREATE TABLE "IssueBlocker" (
    "id" TEXT NOT NULL,
    "blockedIssueId" TEXT NOT NULL,
    "blockerIssueId" TEXT NOT NULL,
    "isBlockingUntilDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueBlocker_pkey" PRIMARY KEY ("id")
);

INSERT INTO "IssueBlocker" (
    "id",
    "blockedIssueId",
    "blockerIssueId",
    "isBlockingUntilDone",
    "createdAt",
    "updatedAt"
)
SELECT
    'migrated-' || md5("id" || '-' || "blockedByIssueId"),
    "id",
    "blockedByIssueId",
    "isBlockedUntilDone",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Issue"
WHERE "blockedByIssueId" IS NOT NULL;

CREATE UNIQUE INDEX "IssueBlocker_blockedIssueId_blockerIssueId_key" ON "IssueBlocker"("blockedIssueId", "blockerIssueId");
CREATE INDEX "IssueBlocker_blockedIssueId_idx" ON "IssueBlocker"("blockedIssueId");
CREATE INDEX "IssueBlocker_blockerIssueId_idx" ON "IssueBlocker"("blockerIssueId");

ALTER TABLE "IssueBlocker"
ADD CONSTRAINT "IssueBlocker_blockedIssueId_fkey"
FOREIGN KEY ("blockedIssueId") REFERENCES "Issue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueBlocker"
ADD CONSTRAINT "IssueBlocker_blockerIssueId_fkey"
FOREIGN KEY ("blockerIssueId") REFERENCES "Issue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
