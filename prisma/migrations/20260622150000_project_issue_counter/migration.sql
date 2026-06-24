-- Store the latest issue number per project so issue codes can be generated
-- atomically inside the same transaction that creates the issue.
ALTER TABLE "Project"
ADD COLUMN "issueCounter" INTEGER NOT NULL DEFAULT 0;

UPDATE "Project" AS p
SET "issueCounter" = COALESCE(existing.max_number, 0)
FROM (
  SELECT
    i."projectId",
    MAX(SUBSTRING(i."code" FROM LENGTH(p2."key") + 2)::INTEGER) AS max_number
  FROM "Issue" AS i
  INNER JOIN "Project" AS p2 ON p2."id" = i."projectId"
  WHERE i."code" LIKE p2."key" || '-%'
    AND SUBSTRING(i."code" FROM LENGTH(p2."key") + 2) ~ '^[0-9]+$'
  GROUP BY i."projectId"
) AS existing
WHERE p."id" = existing."projectId";
