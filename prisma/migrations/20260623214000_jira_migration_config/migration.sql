CREATE TABLE "JiraMigrationConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jiraUrl" TEXT NOT NULL,
    "jql" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastTestedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraMigrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraMigrationConfig_projectId_key" ON "JiraMigrationConfig"("projectId");
CREATE INDEX "JiraMigrationConfig_projectId_idx" ON "JiraMigrationConfig"("projectId");
CREATE INDEX "JiraMigrationConfig_updatedAt_idx" ON "JiraMigrationConfig"("updatedAt");

ALTER TABLE "JiraMigrationConfig"
ADD CONSTRAINT "JiraMigrationConfig_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
