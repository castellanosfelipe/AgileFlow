ALTER TABLE "Issue" ADD COLUMN "blockedByIssueId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "isBlockedUntilDone" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Issue_blockedByIssueId_idx" ON "Issue"("blockedByIssueId");

ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_blockedByIssueId_fkey"
FOREIGN KEY ("blockedByIssueId") REFERENCES "Issue"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
