-- Align AuditLog with the application audit contract.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";
DROP INDEX IF EXISTS "AuditLog_actorId_idx";

ALTER TABLE "AuditLog" RENAME COLUMN "actorId" TO "userId";
ALTER TABLE "AuditLog" ADD COLUMN "oldValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "newValue" JSONB;

UPDATE "AuditLog"
SET "newValue" = "metadata"
WHERE "metadata" IS NOT NULL;

UPDATE "AuditLog"
SET "userId" = (
  SELECT "id"
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "userId" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "AuditLog" DROP COLUMN "metadata";

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
