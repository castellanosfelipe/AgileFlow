ALTER TABLE "Issue" ADD COLUMN "parentIssueId" TEXT;

CREATE INDEX "Issue_parentIssueId_idx" ON "Issue"("parentIssueId");

ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_parentIssueId_fkey"
FOREIGN KEY ("parentIssueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
