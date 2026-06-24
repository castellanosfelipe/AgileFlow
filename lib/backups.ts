import {
  BackupFrequency,
  BackupStatus,
  BackupType,
  Prisma
} from "@prisma/client";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { auditJson } from "@/lib/audit";
import { getCurrentUserAccess, getDefaultProject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(process.cwd());
const defaultBackupBase = path.join(projectRoot, "backups");
const schedulerIntervalMs = 60 * 1000;
const excludedRootEntries = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "backups",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "outputs",
  "playwright-report",
  "test-results",
  "work"
]);
const excludedFileNames = new Set([
  ".env",
  ".next-dev.err.log",
  ".next-dev.log",
  "tsconfig.tsbuildinfo"
]);

type BackupAdminContext = {
  project: {
    id: string;
    key: string;
    name: string;
  };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

type BackupManifest = {
  app: {
    name: string;
    version: string;
  };
  backup: {
    id: string;
    type: BackupType;
    createdAt: string;
    generatedBy: string | null;
  };
  project: {
    id: string;
    key: string;
    name: string;
  };
  database: {
    included: boolean;
    method: "pg_dump" | "json_fallback" | "none";
    path: string | null;
  };
  files: {
    sourceIncluded: boolean;
    uploadsIncluded: boolean;
    exclusions: string[];
  };
  restore: {
    databaseRestoreSupported: boolean;
    fileRestoreSupportedFromUi: boolean;
    notes: string[];
  };
};

type ScheduleInput = {
  scheduleEnabled: boolean;
  frequency: BackupFrequency;
  runAt: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  retentionMaxCount: number;
  retentionMaxDays?: number | null;
};

type BackupConfigInput = ScheduleInput & {
  storagePath?: string;
};

class BackupSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupSecurityError";
  }
}

function getAllowedBackupBases() {
  const bases = [defaultBackupBase];
  if (process.env.BACKUP_ALLOWED_BASE_DIR) {
    bases.push(path.resolve(process.env.BACKUP_ALLOWED_BASE_DIR));
  }

  return [...new Set(bases.map((base) => path.resolve(base)))];
}

function isSubPath(target: string, base: string) {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveSafeStoragePath(storagePath?: string) {
  const rawPath = storagePath?.trim() || defaultBackupBase;
  const resolvedPath = path.resolve(rawPath);
  const allowed = getAllowedBackupBases().some((base) =>
    isSubPath(resolvedPath, base)
  );

  if (!allowed) {
    throw new BackupSecurityError(
      "La ruta debe estar dentro de la carpeta de backups permitida."
    );
  }

  if (resolvedPath === projectRoot) {
    throw new BackupSecurityError("No se permite usar la raiz del proyecto.");
  }

  return resolvedPath;
}

async function ensureWritableDirectory(storagePath: string, createIfMissing = true) {
  try {
    const info = await stat(storagePath);
    if (!info.isDirectory()) {
      throw new BackupSecurityError("La ruta configurada no es una carpeta.");
    }
  } catch (error) {
    if (!createIfMissing) {
      throw new BackupSecurityError("La carpeta no existe.");
    }

    await mkdir(storagePath, { recursive: true });
  }

  const probePath = path.join(storagePath, `.write-test-${Date.now()}.tmp`);
  await writeFile(probePath, "ok");
  await unlink(probePath).catch(() => undefined);
}

function sanitizeSegment(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "backup"
  );
}

function formatStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

async function runCommand(command: string, args: string[], cwd = projectRoot) {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });

    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el comando";
    return {
      ok: false,
      stdout: "",
      stderr: message
    };
  }
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function getPackageInfo() {
  try {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8")
    ) as { name?: string; version?: string };
    return {
      name: packageJson.name ?? "jira-lite-mvp",
      version: packageJson.version ?? "0.0.0"
    };
  } catch {
    return {
      name: "jira-lite-mvp",
      version: "0.0.0"
    };
  }
}

function shouldSkipPath(sourcePath: string, rootEntryName?: string) {
  const name = path.basename(sourcePath);

  if (rootEntryName && excludedRootEntries.has(rootEntryName)) return true;
  if (excludedFileNames.has(name)) return true;
  if (name.startsWith(".env") && name !== ".env.example") return true;
  if (name.endsWith(".log")) return true;

  return false;
}

async function copyProjectFiles(destination: string, storagePath: string) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(projectRoot, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(projectRoot, entry.name);
    if (shouldSkipPath(sourcePath, entry.name)) continue;
    if (isSubPath(sourcePath, storagePath)) continue;

    await copyRecursive(sourcePath, path.join(destination, entry.name), storagePath);
  }
}

async function copyRecursive(sourcePath: string, destinationPath: string, storagePath: string) {
  if (shouldSkipPath(sourcePath)) return;
  if (isSubPath(sourcePath, storagePath)) return;

  const info = await stat(sourcePath);
  if (info.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    const entries = await readdir(sourcePath);
    for (const entry of entries) {
      await copyRecursive(
        path.join(sourcePath, entry),
        path.join(destinationPath, entry),
        storagePath
      );
    }
    return;
  }

  if (info.isFile()) {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

async function exportDatabase(destination: string) {
  await mkdir(destination, { recursive: true });
  const sqlPath = path.join(destination, "database.sql");
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const pgDump = await runCommand("pg_dump", [
      "--dbname",
      databaseUrl,
      "--format=plain",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--file",
      sqlPath
    ]);

    if (pgDump.ok) {
      return {
        method: "pg_dump" as const,
        relativePath: "database/database.sql"
      };
    }
  }

  const jsonPath = path.join(destination, "database.json");
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  const dump: Record<string, unknown[]> = {};

  for (const table of tables) {
    const safeTableName = table.table_name.replace(/"/g, '""');
    dump[table.table_name] = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${safeTableName}"`
    );
  }

  await writeFile(jsonPath, JSON.stringify(dump, null, 2));
  return {
    method: "json_fallback" as const,
    relativePath: "database/database.json"
  };
}

async function createArchive(stagingPath: string, archivePath: string) {
  const result = await runCommand("tar", ["-czf", archivePath, "-C", stagingPath, "."]);
  if (!result.ok) {
    throw new Error(
      "No se pudo comprimir el backup. Verifica que tar este disponible en el servidor."
    );
  }
}

async function extractArchive(archivePath: string, destination: string) {
  await mkdir(destination, { recursive: true });
  const result = await runCommand("tar", ["-xzf", archivePath, "-C", destination]);
  if (!result.ok) {
    throw new Error("No se pudo extraer el backup seleccionado.");
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

const restoreTableOrder = [
  "User",
  "Project",
  "ProjectMember",
  "DirectoryConnection",
  "Sprint",
  "Epic",
  "Issue",
  "IssueBlocker",
  "IssueLabel",
  "IssueComment",
  "IssueAttachment",
  "IssueWorklog",
  "AuditLog",
  "BackupConfig",
  "BackupRecord",
  "BackupLog"
];

const enumColumnCasts = new Map<string, string>([
  ["ProjectMember.role", '"ProjectRole"'],
  ["Sprint.status", '"SprintStatus"'],
  ["Issue.type", '"IssueType"'],
  ["Issue.status", '"IssueStatus"'],
  ["Issue.priority", '"IssuePriority"'],
  ["BackupConfig.frequency", '"BackupFrequency"'],
  ["BackupRecord.type", '"BackupType"'],
  ["BackupRecord.status", '"BackupStatus"']
]);

const jsonColumns = new Set([
  "AuditLog.oldValue",
  "AuditLog.newValue",
  "BackupLog.details",
  "BackupRecord.manifest"
]);

const dateColumnNames = new Set([
  "completedAt",
  "createdAt",
  "dueDate",
  "endsAt",
  "lastRunAt",
  "nextRunAt",
  "startedAt",
  "startDate",
  "startsAt",
  "updatedAt"
]);

function getPlaceholder(table: string, column: string, index: number) {
  const key = `${table}.${column}`;
  const cast = enumColumnCasts.get(key);
  if (cast) return `$${index}::${cast}`;
  if (jsonColumns.has(key)) return `$${index}::jsonb`;
  if (dateColumnNames.has(column) || column.endsWith("_at")) {
    return `$${index}::timestamp`;
  }
  return `$${index}`;
}

async function insertRestoredRows(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const values: unknown[] = [];
  const rowPlaceholders = rows.map((row) => {
    const placeholders = columns.map((column) => {
      const value = row[column];
      values.push(
        jsonColumns.has(`${table}.${column}`) && value !== null
          ? JSON.stringify(value)
          : value
      );
      return getPlaceholder(table, column, values.length);
    });

    return `(${placeholders.join(", ")})`;
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) VALUES ${rowPlaceholders.join(", ")}`,
    ...values
  );
}

export async function restoreJsonDatabase(jsonPath: string) {
  const dump = JSON.parse(await readFile(jsonPath, "utf8")) as Record<
    string,
    Array<Record<string, unknown>>
  >;
  const tables = Object.keys(dump);
  if (!tables.length) {
    throw new Error("El respaldo JSON no contiene tablas para restaurar.");
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map(quoteIdentifier).join(", ")} RESTART IDENTITY CASCADE`
  );

  const orderedTables = [
    ...restoreTableOrder.filter((table) => tables.includes(table)),
    ...tables.filter((table) => !restoreTableOrder.includes(table)).sort()
  ];

  for (const table of orderedTables) {
    const rows = dump[table] ?? [];
    for (let index = 0; index < rows.length; index += 100) {
      await insertRestoredRows(table, rows.slice(index, index + 100));
    }
  }
}

function buildManifest({
  backupId,
  generatedBy,
  project,
  type,
  database
}: {
  backupId: string;
  generatedBy: string | null;
  project: BackupAdminContext["project"];
  type: BackupType;
  database: Awaited<ReturnType<typeof exportDatabase>>;
}): Promise<BackupManifest> {
  return getPackageInfo().then((app) => ({
    app,
    backup: {
      id: backupId,
      type,
      createdAt: new Date().toISOString(),
      generatedBy
    },
    project,
    database: {
      included: true,
      method: database.method,
      path: database.relativePath
    },
    files: {
      sourceIncluded: true,
      uploadsIncluded: true,
      exclusions: [
        "node_modules",
        ".next",
        "dist",
        "build",
        ".git",
        "backups",
        "logs",
        "caches",
        "archivos .env con secretos"
      ]
    },
    restore: {
      databaseRestoreSupported:
        database.method === "pg_dump" || database.method === "json_fallback",
      fileRestoreSupportedFromUi: false,
      notes: [
        "La restauracion desde interfaz aplica la base de datos desde dump SQL o exportacion JSON interna.",
        "El codigo fuente y los adjuntos quedan incluidos en el backup, pero no se sobrescriben en caliente desde la app."
      ]
    }
  }));
}

export function computeNextBackupRun(
  schedule: Pick<
    BackupConfigInput,
    "dayOfMonth" | "dayOfWeek" | "frequency" | "runAt" | "scheduleEnabled"
  >,
  from = new Date()
) {
  if (!schedule.scheduleEnabled) return null;

  const [hours, minutes] = schedule.runAt.split(":").map(Number);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === "DAILY") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.frequency === "WEEKLY") {
    const targetDay = schedule.dayOfWeek ?? 1;
    const delta = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + delta);
    if (next <= from) next.setDate(next.getDate() + 7);
    return next;
  }

  const targetDate = schedule.dayOfMonth ?? 1;
  next.setDate(Math.min(targetDate, 28));
  if (next <= from) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(targetDate, 28));
  }
  return next;
}

export async function requireBackupAdmin(): Promise<BackupAdminContext> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new BackupSecurityError("No has iniciado sesion.");
  }

  const project = await getDefaultProject();
  if (!project) {
    throw new BackupSecurityError("No hay proyecto configurado.");
  }

  const access = await getCurrentUserAccess(user.id, project.id);
  if (!access.isAdmin) {
    throw new BackupSecurityError("Solo un administrador puede gestionar backups.");
  }

  return {
    project,
    user
  };
}

export function isBackupSecurityError(error: unknown) {
  return error instanceof BackupSecurityError;
}

export async function getOrCreateBackupConfig(projectId: string) {
  const existingConfig = await prisma.backupConfig.findUnique({
    where: { projectId }
  });

  if (existingConfig) return existingConfig;

  const storagePath = resolveSafeStoragePath();
  await ensureWritableDirectory(storagePath, true);

  return prisma.backupConfig.create({
    data: {
      projectId,
      storagePath,
      nextRunAt: null
    }
  });
}

async function createBackupLog({
  action,
  backupId,
  details,
  level = "info",
  message,
  projectId,
  userId
}: {
  action: string;
  backupId?: string | null;
  details?: Prisma.InputJsonValue | null;
  level?: "info" | "warn" | "error";
  message: string;
  projectId: string;
  userId?: string | null;
}) {
  await prisma.backupLog.create({
    data: {
      action,
      backupId,
      details: details ?? undefined,
      level,
      message,
      projectId,
      userId
    }
  });
}

async function auditBackupAction({
  action,
  entityId,
  newValue,
  oldValue,
  projectId,
  userId
}: {
  action: string;
  entityId: string;
  newValue?: unknown;
  oldValue?: unknown;
  projectId: string;
  userId?: string | null;
}) {
  if (!userId) return;

  await prisma.auditLog.create({
    data: {
      action,
      entityType: "Backup",
      entityId,
      oldValue: auditJson(oldValue ?? null),
      newValue: auditJson(newValue ?? null),
      projectId,
      userId
    }
  });
}

export async function getBackupOverview(context: BackupAdminContext) {
  const config = await getOrCreateBackupConfig(context.project.id);
  const [backups, logs] = await Promise.all([
    prisma.backupRecord.findMany({
      where: { projectId: context.project.id },
      include: {
        generatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.backupLog.findMany({
      where: { projectId: context.project.id },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  return {
    project: context.project,
    config,
    backups,
    logs,
    summary: {
      lastBackup: backups.find((backup) => backup.status === "SUCCESS") ?? null,
      nextRunAt: config.nextRunAt,
      storagePath: config.storagePath,
      scheduleEnabled: config.scheduleEnabled,
      totalBackups: backups.filter((backup) => backup.status !== "DELETED").length
    }
  };
}

export async function updateBackupStoragePath(
  context: BackupAdminContext,
  storagePath: string,
  createIfMissing: boolean
) {
  const config = await getOrCreateBackupConfig(context.project.id);
  const safePath = resolveSafeStoragePath(storagePath);
  await ensureWritableDirectory(safePath, createIfMissing);

  const updatedConfig = await prisma.backupConfig.update({
    where: { id: config.id },
    data: { storagePath: safePath }
  });

  await createBackupLog({
    action: "backup.storage_updated",
    message: "Ruta de backups actualizada correctamente.",
    projectId: context.project.id,
    userId: context.user.id,
    details: { oldPath: config.storagePath, newPath: safePath }
  });
  await auditBackupAction({
    action: "backup.storage_updated",
    entityId: updatedConfig.id,
    oldValue: { storagePath: config.storagePath },
    newValue: { storagePath: safePath },
    projectId: context.project.id,
    userId: context.user.id
  });

  return updatedConfig;
}

export async function updateBackupSchedule(
  context: BackupAdminContext,
  input: ScheduleInput
) {
  const config = await getOrCreateBackupConfig(context.project.id);
  const nextRunAt = computeNextBackupRun(input);

  const updatedConfig = await prisma.backupConfig.update({
    where: { id: config.id },
    data: {
      scheduleEnabled: input.scheduleEnabled,
      frequency: input.frequency,
      runAt: input.runAt,
      dayOfWeek: input.frequency === "WEEKLY" ? input.dayOfWeek : null,
      dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null,
      retentionMaxCount: input.retentionMaxCount,
      retentionMaxDays: input.retentionMaxDays ?? null,
      nextRunAt
    }
  });

  await createBackupLog({
    action: "backup.schedule_updated",
    message: input.scheduleEnabled
      ? "Programacion de backups actualizada."
      : "Programacion de backups pausada.",
    projectId: context.project.id,
    userId: context.user.id,
    details: input as Prisma.InputJsonValue
  });
  await auditBackupAction({
    action: "backup.schedule_updated",
    entityId: updatedConfig.id,
    oldValue: config,
    newValue: updatedConfig,
    projectId: context.project.id,
    userId: context.user.id
  });

  return updatedConfig;
}

export async function disableBackupSchedule(context: BackupAdminContext) {
  const config = await getOrCreateBackupConfig(context.project.id);
  const updatedConfig = await prisma.backupConfig.update({
    where: { id: config.id },
    data: {
      scheduleEnabled: false,
      nextRunAt: null
    }
  });

  await createBackupLog({
    action: "backup.schedule_deleted",
    message: "Programacion de backups eliminada.",
    projectId: context.project.id,
    userId: context.user.id
  });

  return updatedConfig;
}

async function applyRetention(projectId: string, configId: string) {
  const config = await prisma.backupConfig.findUnique({ where: { id: configId } });
  if (!config) return;

  const successfulBackups = await prisma.backupRecord.findMany({
    where: {
      projectId,
      status: BackupStatus.SUCCESS,
      type: {
        not: BackupType.PRE_RESTORE
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const toDelete = new Set<string>();
  successfulBackups
    .slice(config.retentionMaxCount)
    .forEach((backup) => toDelete.add(backup.id));

  if (config.retentionMaxDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - config.retentionMaxDays);
    successfulBackups
      .filter((backup) => backup.createdAt < cutoff)
      .forEach((backup) => toDelete.add(backup.id));
  }

  for (const backupId of toDelete) {
    const backup = successfulBackups.find((item) => item.id === backupId);
    if (!backup) continue;
    await rm(backup.filePath, { force: true }).catch(() => undefined);
    await prisma.backupRecord.update({
      where: { id: backup.id },
      data: {
        status: BackupStatus.DELETED,
        errorMessage: "Eliminado por politica de retencion."
      }
    });
  }
}

export async function createBackup({
  project,
  type,
  userId,
  skipRetention = false
}: {
  project: BackupAdminContext["project"];
  type: BackupType;
  userId?: string | null;
  skipRetention?: boolean;
}) {
  const config = await getOrCreateBackupConfig(project.id);
  const storagePath = resolveSafeStoragePath(config.storagePath);
  await ensureWritableDirectory(storagePath, true);

  const fileName = `jira-lite-${sanitizeSegment(project.key)}-${formatStamp()}-${type.toLowerCase()}.tar.gz`;
  const archivePath = path.join(storagePath, fileName);
  const backup = await prisma.backupRecord.create({
    data: {
      fileName,
      filePath: archivePath,
      storagePath,
      type,
      status: BackupStatus.IN_PROGRESS,
      projectId: project.id,
      generatedById: userId ?? null
    }
  });
  const stagingPath = path.join(storagePath, `.tmp-${backup.id}`);

  try {
    await createBackupLog({
      action: "backup.started",
      backupId: backup.id,
      message: "Backup iniciado.",
      projectId: project.id,
      userId
    });

    await mkdir(stagingPath, { recursive: true });
    const database = await exportDatabase(path.join(stagingPath, "database"));
    await copyProjectFiles(path.join(stagingPath, "source"), storagePath);

    const manifest = await buildManifest({
      backupId: backup.id,
      database,
      generatedBy: userId ?? null,
      project,
      type
    });
    await writeFile(
      path.join(stagingPath, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    await createArchive(stagingPath, archivePath);
    const [fileInfo, checksum] = await Promise.all([
      stat(archivePath),
      hashFile(archivePath)
    ]);

    const completedBackup = await prisma.backupRecord.update({
      where: { id: backup.id },
      data: {
        checksum,
        completedAt: new Date(),
        manifest: {
          ...manifest,
          archive: {
            checksum,
            sizeBytes: fileInfo.size
          }
        },
        sizeBytes: Math.min(fileInfo.size, 2147483647),
        status: BackupStatus.SUCCESS
      },
      include: {
        generatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    if (type === BackupType.SCHEDULED) {
      const nextRunAt = computeNextBackupRun(config, new Date(Date.now() + 1000));
      await prisma.backupConfig.update({
        where: { id: config.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt
        }
      });
    }

    await createBackupLog({
      action: "backup.completed",
      backupId: backup.id,
      message: "Backup generado correctamente.",
      projectId: project.id,
      userId,
      details: {
        checksum,
        fileName,
        sizeBytes: fileInfo.size
      }
    });
    await auditBackupAction({
      action: "backup.created",
      entityId: backup.id,
      newValue: {
        checksum,
        fileName,
        type,
        sizeBytes: fileInfo.size
      },
      projectId: project.id,
      userId
    });

    if (!skipRetention) await applyRetention(project.id, config.id);

    return completedBackup;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el backup.";
    await prisma.backupRecord.update({
      where: { id: backup.id },
      data: {
        completedAt: new Date(),
        errorMessage: message,
        status: BackupStatus.FAILED
      }
    });
    await createBackupLog({
      action: "backup.failed",
      backupId: backup.id,
      level: "error",
      message,
      projectId: project.id,
      userId
    });
    throw new Error(message);
  } finally {
    await rm(stagingPath, { force: true, recursive: true }).catch(() => undefined);
  }
}

export async function getBackupForDownload(context: BackupAdminContext, backupId: string) {
  const backup = await prisma.backupRecord.findFirst({
    where: {
      id: backupId,
      projectId: context.project.id,
      status: {
        in: [BackupStatus.SUCCESS, BackupStatus.RESTORED]
      }
    }
  });

  if (!backup) {
    throw new Error("Backup no encontrado o no disponible para descarga.");
  }

  const resolvedFile = path.resolve(backup.filePath);
  const storagePath = resolveSafeStoragePath(backup.storagePath);
  if (!isSubPath(resolvedFile, storagePath)) {
    throw new BackupSecurityError("Ruta de backup no permitida.");
  }

  await access(resolvedFile);
  return {
    backup,
    filePath: resolvedFile
  };
}

export async function validateBackupIntegrity(
  context: BackupAdminContext,
  backupId: string
) {
  const backup = await prisma.backupRecord.findFirst({
    where: {
      id: backupId,
      projectId: context.project.id
    }
  });

  if (!backup || !backup.checksum) {
    throw new Error("Backup no encontrado o sin checksum registrado.");
  }

  const resolvedFile = path.resolve(backup.filePath);
  const storagePath = resolveSafeStoragePath(backup.storagePath);
  if (!isSubPath(resolvedFile, storagePath)) {
    throw new BackupSecurityError("Ruta de backup no permitida.");
  }

  await access(resolvedFile);
  const checksum = await hashFile(resolvedFile);
  const valid = checksum === backup.checksum;

  await createBackupLog({
    action: "backup.integrity_checked",
    backupId: backup.id,
    level: valid ? "info" : "error",
    message: valid
      ? "Integridad validada correctamente."
      : "La integridad del backup no coincide.",
    projectId: context.project.id,
    userId: context.user.id,
    details: {
      expected: backup.checksum,
      actual: checksum
    }
  });

  return {
    backupId: backup.id,
    checksum,
    expectedChecksum: backup.checksum,
    valid
  };
}

export async function deleteBackup(context: BackupAdminContext, backupId: string) {
  const backup = await prisma.backupRecord.findFirst({
    where: {
      id: backupId,
      projectId: context.project.id
    }
  });

  if (!backup) throw new Error("Backup no encontrado.");

  const storagePath = resolveSafeStoragePath(backup.storagePath);
  const resolvedFile = path.resolve(backup.filePath);
  if (isSubPath(resolvedFile, storagePath)) {
    await rm(resolvedFile, { force: true }).catch(() => undefined);
  }

  const updatedBackup = await prisma.backupRecord.update({
    where: { id: backup.id },
    data: {
      status: BackupStatus.DELETED,
      errorMessage: "Eliminado manualmente."
    }
  });

  await createBackupLog({
    action: "backup.deleted",
    backupId: backup.id,
    message: "Backup eliminado.",
    projectId: context.project.id,
    userId: context.user.id
  });
  await auditBackupAction({
    action: "backup.deleted",
    entityId: backup.id,
    oldValue: {
      fileName: backup.fileName,
      checksum: backup.checksum
    },
    newValue: null,
    projectId: context.project.id,
    userId: context.user.id
  });

  return updatedBackup;
}

export async function restoreBackup(context: BackupAdminContext, backupId: string) {
  const backup = await prisma.backupRecord.findFirst({
    where: {
      id: backupId,
      projectId: context.project.id,
      status: {
        in: [BackupStatus.SUCCESS, BackupStatus.RESTORED]
      }
    }
  });

  if (!backup) throw new Error("Backup no encontrado o no restaurable.");

  const integrity = await validateBackupIntegrity(context, backup.id);
  if (!integrity.valid) {
    throw new Error("El backup no paso la validacion de integridad.");
  }

  await createBackup({
    project: context.project,
    type: BackupType.PRE_RESTORE,
    userId: context.user.id,
    skipRetention: true
  });

  const storagePath = resolveSafeStoragePath(backup.storagePath);
  const extractPath = path.join(storagePath, `.restore-${backup.id}-${Date.now()}`);

  try {
    await extractArchive(backup.filePath, extractPath);
    const manifestPath = path.join(extractPath, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
    if (manifest.project.key !== context.project.key) {
      throw new Error("El backup no corresponde al proyecto actual.");
    }

    const databaseSql = path.join(extractPath, "database", "database.sql");
    const databaseJson = path.join(extractPath, "database", "database.json");

    if (manifest.database.method === "pg_dump") {
      await access(databaseSql);

      if (!process.env.DATABASE_URL) {
        throw new Error("No hay DATABASE_URL configurado para restaurar la base de datos.");
      }

      const restoreResult = await runCommand("psql", [
        process.env.DATABASE_URL,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        databaseSql
      ]);

      if (!restoreResult.ok) {
        throw new Error(
          "No se pudo restaurar la base de datos. Verifica que psql este disponible."
        );
      }
    } else {
      await access(databaseJson);
      await restoreJsonDatabase(databaseJson);
    }

    const updatedBackup = await prisma.backupRecord.update({
      where: { id: backup.id },
      data: {
        checksum: backup.checksum,
        completedAt: backup.completedAt ?? new Date(),
        errorMessage: null,
        filePath: backup.filePath,
        sizeBytes: backup.sizeBytes,
        status: BackupStatus.RESTORED,
        storagePath: backup.storagePath
      }
    });

    await createBackupLog({
      action: "backup.restored",
      backupId: backup.id,
      message: "Backup restaurado correctamente.",
      projectId: context.project.id,
      userId: context.user.id
    });
    await auditBackupAction({
      action: "backup.restored",
      entityId: backup.id,
      newValue: {
        fileName: backup.fileName,
        checksum: backup.checksum
      },
      projectId: context.project.id,
      userId: context.user.id
    });

    return updatedBackup;
  } finally {
    await rm(extractPath, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function runDueScheduledBackups() {
  const now = new Date();
  const dueConfigs = await prisma.backupConfig.findMany({
    where: {
      scheduleEnabled: true,
      nextRunAt: {
        lte: now
      }
    },
    include: {
      project: {
        select: {
          id: true,
          key: true,
          name: true
        }
      }
    }
  });

  for (const config of dueConfigs) {
    const inProgress = await prisma.backupRecord.findFirst({
      where: {
        projectId: config.projectId,
        status: BackupStatus.IN_PROGRESS
      },
      select: { id: true }
    });

    if (inProgress) continue;

    try {
      await createBackup({
        project: config.project,
        type: BackupType.SCHEDULED,
        userId: null
      });
    } catch (error) {
      const nextRunAt = computeNextBackupRun(config, new Date(Date.now() + 1000));
      await prisma.backupConfig.update({
        where: { id: config.id },
        data: { nextRunAt }
      });
      await createBackupLog({
        action: "backup.schedule_failed",
        level: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el backup programado.",
        projectId: config.projectId
      });
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jiraLiteBackupScheduler:
    | {
        interval: NodeJS.Timeout;
        running: boolean;
      }
    | undefined;
}

export function ensureBackupSchedulerStarted() {
  if (globalThis.__jiraLiteBackupScheduler) return;

  const state = {
    interval: setInterval(async () => {
      if (state.running) return;
      state.running = true;
      try {
        await runDueScheduledBackups();
      } finally {
        state.running = false;
      }
    }, schedulerIntervalMs),
    running: false
  };

  state.interval.unref?.();
  globalThis.__jiraLiteBackupScheduler = state;
}
