-- Backup management module.
CREATE TYPE "BackupType" AS ENUM ('MANUAL', 'SCHEDULED', 'PRE_RESTORE');
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'RESTORED', 'DELETED');
CREATE TYPE "BackupFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "BackupConfig" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "frequency" "BackupFrequency" NOT NULL DEFAULT 'DAILY',
  "runAt" TEXT NOT NULL DEFAULT '02:00',
  "dayOfWeek" INTEGER,
  "dayOfMonth" INTEGER,
  "retentionMaxCount" INTEGER NOT NULL DEFAULT 10,
  "retentionMaxDays" INTEGER,
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackupConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupRecord" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "type" "BackupType" NOT NULL,
  "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
  "sizeBytes" INTEGER,
  "checksum" TEXT,
  "manifest" JSONB,
  "generatedById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupLog" (
  "id" TEXT NOT NULL,
  "backupId" TEXT,
  "projectId" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BackupLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackupConfig_projectId_key" ON "BackupConfig"("projectId");
CREATE INDEX "BackupConfig_scheduleEnabled_idx" ON "BackupConfig"("scheduleEnabled");
CREATE INDEX "BackupConfig_nextRunAt_idx" ON "BackupConfig"("nextRunAt");

CREATE UNIQUE INDEX "BackupRecord_fileName_key" ON "BackupRecord"("fileName");
CREATE INDEX "BackupRecord_projectId_idx" ON "BackupRecord"("projectId");
CREATE INDEX "BackupRecord_status_idx" ON "BackupRecord"("status");
CREATE INDEX "BackupRecord_type_idx" ON "BackupRecord"("type");
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

CREATE INDEX "BackupLog_backupId_idx" ON "BackupLog"("backupId");
CREATE INDEX "BackupLog_projectId_idx" ON "BackupLog"("projectId");
CREATE INDEX "BackupLog_userId_idx" ON "BackupLog"("userId");
CREATE INDEX "BackupLog_action_idx" ON "BackupLog"("action");
CREATE INDEX "BackupLog_createdAt_idx" ON "BackupLog"("createdAt");

ALTER TABLE "BackupConfig"
ADD CONSTRAINT "BackupConfig_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackupRecord"
ADD CONSTRAINT "BackupRecord_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackupRecord"
ADD CONSTRAINT "BackupRecord_generatedById_fkey"
FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackupLog"
ADD CONSTRAINT "BackupLog_backupId_fkey"
FOREIGN KEY ("backupId") REFERENCES "BackupRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackupLog"
ADD CONSTRAINT "BackupLog_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackupLog"
ADD CONSTRAINT "BackupLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
