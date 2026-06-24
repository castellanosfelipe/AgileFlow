CREATE TABLE "IssueAttachment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueAttachment_issueId_idx" ON "IssueAttachment"("issueId");
CREATE INDEX "IssueAttachment_uploaderId_idx" ON "IssueAttachment"("uploaderId");

ALTER TABLE "IssueAttachment"
ADD CONSTRAINT "IssueAttachment_issueId_fkey"
FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueAttachment"
ADD CONSTRAINT "IssueAttachment_uploaderId_fkey"
FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
