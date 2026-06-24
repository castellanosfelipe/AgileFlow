-- Analytics-oriented indexes for project planning dashboards.
CREATE INDEX IF NOT EXISTS "Issue_projectId_sprintId_analytics_idx"
ON "Issue"("projectId", "sprintId");

CREATE INDEX IF NOT EXISTS "Issue_projectId_assigneeId_analytics_idx"
ON "Issue"("projectId", "assigneeId");

CREATE INDEX IF NOT EXISTS "Issue_projectId_parentIssueId_analytics_idx"
ON "Issue"("projectId", "parentIssueId");

CREATE INDEX IF NOT EXISTS "IssueWorklog_issueId_createdAt_analytics_idx"
ON "IssueWorklog"("issueId", "createdAt");
