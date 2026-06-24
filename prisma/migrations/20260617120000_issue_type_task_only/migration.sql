UPDATE "Issue"
SET "type" = 'task'
WHERE "type" <> 'task';

ALTER TABLE "Issue" ALTER COLUMN "type" DROP DEFAULT;

ALTER TYPE "IssueType" RENAME TO "IssueType_old";

CREATE TYPE "IssueType" AS ENUM ('task');

ALTER TABLE "Issue"
ALTER COLUMN "type" TYPE "IssueType"
USING "type"::text::"IssueType";

ALTER TABLE "Issue" ALTER COLUMN "type" SET DEFAULT 'task';

DROP TYPE "IssueType_old";
