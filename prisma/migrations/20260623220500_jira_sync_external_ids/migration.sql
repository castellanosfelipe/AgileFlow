ALTER TABLE "User" ADD COLUMN "jiraAccountId" TEXT;
ALTER TABLE "Sprint" ADD COLUMN "jiraSprintId" TEXT;
ALTER TABLE "Epic" ADD COLUMN "jiraIssueId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "jiraIssueId" TEXT;
ALTER TABLE "IssueComment" ADD COLUMN "jiraCommentId" TEXT;
ALTER TABLE "IssueAttachment" ADD COLUMN "jiraAttachmentId" TEXT;
ALTER TABLE "IssueWorklog" ADD COLUMN "jiraWorklogId" TEXT;

CREATE UNIQUE INDEX "User_jiraAccountId_key" ON "User"("jiraAccountId");
CREATE UNIQUE INDEX "Sprint_jiraSprintId_key" ON "Sprint"("jiraSprintId");
CREATE UNIQUE INDEX "Epic_jiraIssueId_key" ON "Epic"("jiraIssueId");
CREATE UNIQUE INDEX "Issue_jiraIssueId_key" ON "Issue"("jiraIssueId");
CREATE UNIQUE INDEX "IssueComment_jiraCommentId_key" ON "IssueComment"("jiraCommentId");
CREATE UNIQUE INDEX "IssueAttachment_jiraAttachmentId_key" ON "IssueAttachment"("jiraAttachmentId");
CREATE UNIQUE INDEX "IssueWorklog_jiraWorklogId_key" ON "IssueWorklog"("jiraWorklogId");
