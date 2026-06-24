UPDATE "Issue"
SET "startDate" = "dueDate" - INTERVAL '7 days'
WHERE "dueDate" < "startDate";
