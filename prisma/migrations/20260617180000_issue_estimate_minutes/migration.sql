UPDATE "Issue"
SET "estimate" = "estimate" * 60
WHERE "estimate" IS NOT NULL
  AND "estimate" > 0
  AND "estimate" <= 100;
