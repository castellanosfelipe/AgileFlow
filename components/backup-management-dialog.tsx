"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  Download,
  FileArchive,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SortableGridHeader,
  sortByState,
  type SortableValue,
  type SortState
} from "@/components/sortable-grid-header";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type BackupFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
type BackupStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAILED"
  | "RESTORED"
  | "DELETED";
type BackupType = "MANUAL" | "SCHEDULED" | "PRE_RESTORE";

type BackupSortKey = "fileName" | "type" | "status" | "size" | "date";
type BackupLogSortKey = "createdAt" | "action" | "message";

type BackupConfig = {
  id: string;
  storagePath: string;
  scheduleEnabled: boolean;
  frequency: BackupFrequency;
  runAt: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  retentionMaxCount: number;
  retentionMaxDays: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type BackupRecord = {
  id: string;
  fileName: string;
  filePath: string;
  storagePath: string;
  type: BackupType;
  status: BackupStatus;
  sizeBytes: number | null;
  checksum: string | null;
  generatedBy: { name: string; email: string } | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type BackupLog = {
  id: string;
  action: string;
  level: string;
  message: string;
  createdAt: string;
};

type BackupOverview = {
  config: BackupConfig;
  backups: BackupRecord[];
  logs: BackupLog[];
  summary: {
    lastBackup: BackupRecord | null;
    nextRunAt: string | null;
    storagePath: string;
    scheduleEnabled: boolean;
    totalBackups: number;
  };
};

const frequencyLabels: Record<BackupFrequency, string> = {
  DAILY: "Diario",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual"
};

const typeLabels: Record<BackupType, string> = {
  MANUAL: "Manual",
  SCHEDULED: "Programado",
  PRE_RESTORE: "Previo a restauracion"
};

const statusLabels: Record<BackupStatus, string> = {
  DELETED: "Eliminado",
  FAILED: "Fallido",
  IN_PROGRESS: "En proceso",
  PENDING: "Pendiente",
  RESTORED: "Restaurado",
  SUCCESS: "Exitoso"
};

const statusClasses: Record<BackupStatus, string> = {
  DELETED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  RESTORED: "border-purple-200 bg-purple-50 text-purple-700",
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

function getBackupSortValue(
  backup: BackupRecord,
  key: BackupSortKey
): SortableValue {
  if (key === "fileName") return backup.fileName;
  if (key === "type") return typeLabels[backup.type];
  if (key === "status") return statusLabels[backup.status];
  if (key === "size") return backup.sizeBytes ?? 0;
  return new Date(backup.completedAt ?? backup.createdAt);
}

function getBackupLogSortValue(
  log: BackupLog,
  key: BackupLogSortKey
): SortableValue {
  if (key === "createdAt") return new Date(log.createdAt);
  if (key === "action") return log.action;
  return log.message;
}

const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado"
];

export function BackupManagementDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = React.useState<BackupOverview | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isSavingPath, setIsSavingPath] = React.useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = React.useState(false);
  const [busyBackupId, setBusyBackupId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [storagePath, setStoragePath] = React.useState("");
  const [createIfMissing, setCreateIfMissing] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<BackupStatus | "ALL">(
    "ALL"
  );
  const [typeFilter, setTypeFilter] = React.useState<BackupType | "ALL">("ALL");
  const [backupSort, setBackupSort] = React.useState<SortState<BackupSortKey>>({
    key: "date",
    direction: "desc"
  });
  const [logSort, setLogSort] = React.useState<SortState<BackupLogSortKey>>({
    key: "createdAt",
    direction: "desc"
  });
  const [restoreBackupId, setRestoreBackupId] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [schedule, setSchedule] = React.useState({
    scheduleEnabled: false,
    frequency: "DAILY" as BackupFrequency,
    runAt: "02:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
    retentionMaxCount: 10,
    retentionMaxDays: ""
  });

  const restorableBackups =
    data?.backups.filter((backup) =>
      ["SUCCESS", "RESTORED"].includes(backup.status)
    ) ?? [];

  const filteredBackups = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (data?.backups ?? []).filter((backup) => {
      if (statusFilter !== "ALL" && backup.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && backup.type !== typeFilter) return false;
      if (!normalizedQuery) return true;

      return [backup.fileName, backup.storagePath, backup.checksum]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [data?.backups, query, statusFilter, typeFilter]);
  const sortedBackups = React.useMemo(
    () => sortByState(filteredBackups, backupSort, getBackupSortValue),
    [backupSort, filteredBackups]
  );
  const sortedLogs = React.useMemo(
    () => sortByState(data?.logs ?? [], logSort, getBackupLogSortValue),
    [data?.logs, logSort]
  );

  async function loadBackups() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<BackupOverview>("/api/backups");
      setData(response);
      setStoragePath(response.config.storagePath);
      setSchedule({
        scheduleEnabled: response.config.scheduleEnabled,
        frequency: response.config.frequency,
        runAt: response.config.runAt,
        dayOfWeek: response.config.dayOfWeek ?? 1,
        dayOfMonth: response.config.dayOfMonth ?? 1,
        retentionMaxCount: response.config.retentionMaxCount,
        retentionMaxDays: response.config.retentionMaxDays
          ? String(response.config.retentionMaxDays)
          : ""
      });
      setRestoreBackupId((current) => current || response.backups[0]?.id || "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la gestion de backups"
      );
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    if (open) void loadBackups();
  }, [open]);

  async function generateBackup() {
    const confirmed = window.confirm(
      "Se generara un backup completo del proyecto. Esta operacion puede tardar algunos minutos. ¿Deseas continuar?"
    );
    if (!confirmed) return;

    setIsGenerating(true);
    setError(null);
    setMessage("Generando backup...");

    try {
      await apiFetch<BackupRecord>("/api/backups/generate", {
        method: "POST"
      });
      setMessage("Backup generado correctamente.");
      await loadBackups();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "No se pudo generar el backup"
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveStoragePath(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingPath(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch<BackupConfig>("/api/backups/config", {
        method: "PATCH",
        body: JSON.stringify({
          createIfMissing,
          storagePath
        })
      });
      setMessage("Ruta de almacenamiento actualizada.");
      await loadBackups();
    } catch (pathError) {
      setError(
        pathError instanceof Error
          ? pathError.message
          : "No se pudo guardar la ruta"
      );
    } finally {
      setIsSavingPath(false);
    }
  }

  async function saveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSchedule(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch<BackupConfig>("/api/backups/schedule", {
        method: "PATCH",
        body: JSON.stringify({
          ...schedule,
          retentionMaxDays: schedule.retentionMaxDays
            ? Number(schedule.retentionMaxDays)
            : null
        })
      });
      setMessage("Programacion guardada correctamente.");
      await loadBackups();
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "No se pudo guardar la programacion"
      );
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function pauseSchedule() {
    setIsSavingSchedule(true);
    setError(null);

    try {
      await apiFetch<BackupConfig>("/api/backups/schedule", {
        method: "DELETE"
      });
      setMessage("Programacion pausada.");
      await loadBackups();
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : "No se pudo pausar la programacion"
      );
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function validateBackup(backupId: string) {
    setBusyBackupId(backupId);
    setError(null);
    setMessage(null);

    try {
      const result = await apiFetch<{ valid: boolean }>(
        `/api/backups/${backupId}/validate`,
        { method: "POST" }
      );
      setMessage(
        result.valid
          ? "Integridad validada correctamente."
          : "El checksum no coincide. No restaures este backup."
      );
      await loadBackups();
    } catch (validateError) {
      setError(
        validateError instanceof Error
          ? validateError.message
          : "No se pudo validar el backup"
      );
    } finally {
      setBusyBackupId(null);
    }
  }

  async function deleteBackup(backupId: string) {
    const confirmed = window.confirm(
      "¿Eliminar este backup? El archivo dejara de estar disponible para descarga o restauracion."
    );
    if (!confirmed) return;

    setBusyBackupId(backupId);
    setError(null);
    setMessage(null);

    try {
      await apiFetch<BackupRecord>(`/api/backups/${backupId}`, {
        method: "DELETE"
      });
      setMessage("Backup eliminado correctamente.");
      await loadBackups();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el backup"
      );
    } finally {
      setBusyBackupId(null);
    }
  }

  async function restoreSelectedBackup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = window.confirm(
      "Restaurar reemplazara la base de datos actual con el backup seleccionado. Se generara un backup previo antes de continuar. ¿Confirmas la restauracion?"
    );
    if (!confirmed) return;

    setBusyBackupId(restoreBackupId);
    setError(null);
    setMessage("Validando y restaurando backup...");

    try {
      await apiFetch<BackupRecord>(`/api/backups/${restoreBackupId}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirmation })
      });
      setConfirmation("");
      setMessage("Backup restaurado correctamente.");
      await loadBackups();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "No se pudo restaurar el backup"
      );
    } finally {
      setBusyBackupId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Gestion de Backups</DialogTitle>
          <DialogDescription>
            Administra copias de seguridad, programacion, integridad y restauracion
            del proyecto.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando gestion de backups...
          </div>
        ) : null}

        {!isLoading && data ? (
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-5">
              <SummaryCard
                icon={FileArchive}
                label="Ultimo backup"
                value={data.summary.lastBackup?.fileName ?? "Sin backups"}
              />
              <SummaryCard
                icon={Clock3}
                label="Proximo backup"
                value={formatDateTime(data.summary.nextRunAt)}
              />
              <SummaryCard
                icon={ShieldCheck}
                label="Programacion"
                value={data.summary.scheduleEnabled ? "Activa" : "Inactiva"}
              />
              <SummaryCard
                icon={DatabaseBackup}
                label="Ruta activa"
                value={data.summary.storagePath}
              />
              <SummaryCard
                icon={CheckCircle2}
                label="Disponibles"
                value={String(data.summary.totalBackups)}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Panel title="Generar backup">
                <p className="text-sm text-muted-foreground">
                  Genera una copia completa bajo demanda. Incluye base de datos,
                  codigo relevante, configuracion exportable y adjuntos.
                </p>
                <Button
                  className="mt-4"
                  disabled={isGenerating}
                  onClick={generateBackup}
                  type="button"
                >
                  {isGenerating ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <DatabaseBackup />
                  )}
                  Generar backup ahora
                </Button>
              </Panel>

              <Panel title="Ruta de almacenamiento">
                <form className="space-y-3" onSubmit={saveStoragePath}>
                  <div className="space-y-2">
                    <Label htmlFor="backup-storage-path">Ruta actual</Label>
                    <Input
                      id="backup-storage-path"
                      onChange={(event) => setStoragePath(event.target.value)}
                      value={storagePath}
                    />
                    <p className="text-xs text-muted-foreground">
                      Por seguridad, la ruta debe estar dentro de la carpeta de
                      backups permitida o en BACKUP_ALLOWED_BASE_DIR.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      checked={createIfMissing}
                      className="size-4 accent-primary"
                      onChange={(event) => setCreateIfMissing(event.target.checked)}
                      type="checkbox"
                    />
                    Crear carpeta si no existe
                  </label>
                  <Button disabled={isSavingPath} type="submit" variant="outline">
                    {isSavingPath ? <Loader2 className="animate-spin" /> : <Save />}
                    Guardar ruta
                  </Button>
                </form>
              </Panel>
            </section>

            <Panel title="Programacion">
              <form
                className="grid gap-3 md:grid-cols-4 lg:grid-cols-7"
                onSubmit={saveSchedule}
              >
                <label className="flex items-end gap-2 rounded-md border px-3 py-2 text-sm">
                  <input
                    checked={schedule.scheduleEnabled}
                    className="mb-1 size-4 accent-primary"
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        scheduleEnabled: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  Activa
                </label>

                <LabeledSelect
                  label="Frecuencia"
                  onChange={(value) =>
                    setSchedule((current) => ({
                      ...current,
                      frequency: value as BackupFrequency
                    }))
                  }
                  value={schedule.frequency}
                >
                  <option value="DAILY">Diario</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                </LabeledSelect>

                <LabeledInput
                  label="Hora"
                  onValueChange={(value) =>
                    setSchedule((current) => ({ ...current, runAt: value }))
                  }
                  type="time"
                  value={schedule.runAt}
                />

                {schedule.frequency === "WEEKLY" ? (
                  <LabeledSelect
                    label="Dia semana"
                    onChange={(value) =>
                      setSchedule((current) => ({
                        ...current,
                        dayOfWeek: Number(value)
                      }))
                    }
                    value={String(schedule.dayOfWeek)}
                  >
                    {weekdays.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </LabeledSelect>
                ) : null}

                {schedule.frequency === "MONTHLY" ? (
                  <LabeledInput
                    label="Dia mes"
                    max={28}
                    min={1}
                    onValueChange={(value) =>
                      setSchedule((current) => ({
                        ...current,
                        dayOfMonth: Number(value)
                      }))
                    }
                    type="number"
                    value={String(schedule.dayOfMonth)}
                  />
                ) : null}

                <LabeledInput
                  label="Max backups"
                  min={1}
                  onValueChange={(value) =>
                    setSchedule((current) => ({
                      ...current,
                      retentionMaxCount: Number(value)
                    }))
                  }
                  type="number"
                  value={String(schedule.retentionMaxCount)}
                />

                <LabeledInput
                  label="Dias retencion"
                  min={1}
                  onValueChange={(value) =>
                    setSchedule((current) => ({
                      ...current,
                      retentionMaxDays: value
                    }))
                  }
                  placeholder="Opcional"
                  type="number"
                  value={schedule.retentionMaxDays}
                />

                <div className="flex items-end gap-2">
                  <Button disabled={isSavingSchedule} type="submit">
                    {isSavingSchedule ? (
                      <Loader2 className="animate-spin" />
                    ) : schedule.scheduleEnabled ? (
                      <Play />
                    ) : (
                      <Save />
                    )}
                    Guardar
                  </Button>
                  <Button
                    disabled={isSavingSchedule}
                    onClick={pauseSchedule}
                    type="button"
                    variant="outline"
                  >
                    <Pause />
                    Pausar
                  </Button>
                </div>
              </form>
            </Panel>

            <Panel title="Historial">
              <div className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_180px]">
                <Input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, ruta o checksum"
                  value={query}
                />
                <Select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as BackupStatus | "ALL")
                  }
                >
                  <option value="ALL">Todos los estados</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as BackupType | "ALL")
                  }
                >
                  <option value="ALL">Todos los tipos</option>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[minmax(0,1.4fr)_120px_110px_110px_120px_160px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <SortableGridHeader
                    label="Backup"
                    onSortChange={setBackupSort}
                    sortKey="fileName"
                    sortState={backupSort}
                  />
                  <SortableGridHeader
                    label="Tipo"
                    onSortChange={setBackupSort}
                    sortKey="type"
                    sortState={backupSort}
                  />
                  <SortableGridHeader
                    label="Estado"
                    onSortChange={setBackupSort}
                    sortKey="status"
                    sortState={backupSort}
                  />
                  <SortableGridHeader
                    label="Tamano"
                    onSortChange={setBackupSort}
                    sortKey="size"
                    sortState={backupSort}
                  />
                  <SortableGridHeader
                    label="Fecha"
                    onSortChange={setBackupSort}
                    sortKey="date"
                    sortState={backupSort}
                  />
                  <span>Acciones</span>
                </div>
                {sortedBackups.length ? (
                  sortedBackups.map((backup) => (
                    <div
                      className="grid grid-cols-[minmax(0,1.4fr)_120px_110px_110px_120px_160px] gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                      key={backup.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{backup.fileName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {backup.storagePath}
                        </p>
                        {backup.checksum ? (
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            SHA-256 {backup.checksum}
                          </p>
                        ) : null}
                        {backup.errorMessage ? (
                          <p className="mt-1 text-xs text-destructive">
                            {backup.errorMessage}
                          </p>
                        ) : null}
                      </div>
                      <span>{typeLabels[backup.type]}</span>
                      <span>
                        <Badge
                          className={cn("border", statusClasses[backup.status])}
                          variant="outline"
                        >
                          {statusLabels[backup.status]}
                        </Badge>
                      </span>
                      <span>{formatBytes(backup.sizeBytes)}</span>
                      <span>{formatDateTime(backup.completedAt ?? backup.createdAt)}</span>
                      <div className="flex flex-wrap gap-1">
                        <IconButton
                          disabled={!["SUCCESS", "RESTORED"].includes(backup.status)}
                          href={`/api/backups/${backup.id}/download`}
                          label="Descargar"
                        >
                          <Download />
                        </IconButton>
                        <IconButton
                          disabled={busyBackupId === backup.id || !backup.checksum}
                          label="Validar integridad"
                          onClick={() => validateBackup(backup.id)}
                        >
                          {busyBackupId === backup.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <ShieldCheck />
                          )}
                        </IconButton>
                        <IconButton
                          disabled={backup.status === "DELETED"}
                          label="Eliminar"
                          onClick={() => deleteBackup(backup.id)}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No hay backups que coincidan con los filtros.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Restauracion">
              <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={restoreSelectedBackup}>
                <LabeledSelect
                  label="Backup"
                  onChange={setRestoreBackupId}
                  value={restoreBackupId}
                >
                  {restorableBackups.map((backup) => (
                    <option key={backup.id} value={backup.id}>
                      {backup.fileName}
                    </option>
                  ))}
                </LabeledSelect>
                <LabeledInput
                  label="Confirmacion"
                  onValueChange={setConfirmation}
                  placeholder="RESTAURAR"
                  value={confirmation}
                />
                <div className="flex items-end">
                  <Button
                    disabled={
                      !restoreBackupId ||
                      confirmation !== "RESTAURAR" ||
                      busyBackupId === restoreBackupId
                    }
                    type="submit"
                    variant="destructive"
                  >
                    {busyBackupId === restoreBackupId ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    Restaurar
                  </Button>
                </div>
              </form>
              <p className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                La restauracion valida integridad y crea un backup previo. Desde
                la interfaz se restaura la base de datos; el codigo y los
                adjuntos quedan disponibles dentro del archivo para recuperacion
                controlada.
              </p>
            </Panel>

            <Panel title="Logs recientes">
              <div className="max-h-56 overflow-auto rounded-md border">
                {sortedLogs.length ? (
                  <>
                    <div className="sticky top-0 z-10 grid grid-cols-[140px_120px_minmax(0,1fr)] gap-2 border-b bg-background px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      <SortableGridHeader
                        label="Fecha"
                        onSortChange={setLogSort}
                        sortKey="createdAt"
                        sortState={logSort}
                      />
                      <SortableGridHeader
                        label="Accion"
                        onSortChange={setLogSort}
                        sortKey="action"
                        sortState={logSort}
                      />
                      <SortableGridHeader
                        label="Mensaje"
                        onSortChange={setLogSort}
                        sortKey="message"
                        sortState={logSort}
                      />
                    </div>
                    {sortedLogs.map((log) => (
                      <div
                        className="grid grid-cols-[140px_120px_minmax(0,1fr)] gap-2 border-b px-3 py-2 text-xs last:border-b-0"
                        key={log.id}
                      >
                        <span>{formatDateTime(log.createdAt)}</span>
                        <span className="font-medium">{log.action}</span>
                        <span
                          className={cn(
                            "truncate",
                            log.level === "error" && "text-destructive",
                            log.level === "warn" && "text-amber-700"
                          )}
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    Aun no hay logs de backup.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        ) : null}

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-3">
      <Icon className="mb-2 size-4 text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

type LabeledInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> & {
  label: string;
  onValueChange: (value: string) => void;
  value: string;
};

function LabeledInput({
  label,
  onValueChange,
  value,
  ...props
}: LabeledInputProps) {
  const id = React.useId();

  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        id={id}
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
        {...props}
      />
    </label>
  );
}

function LabeledSelect({
  children,
  label,
  onChange,
  value
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

function IconButton({
  children,
  disabled,
  href,
  label,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  label: string;
  onClick?: () => void;
}) {
  const className =
    "grid size-8 place-items-center rounded-md border bg-background text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4";

  if (href) {
    return (
      <a
        aria-disabled={disabled}
        aria-label={label}
        className={cn(className, disabled && "pointer-events-none opacity-50")}
        href={href}
        title={label}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      aria-label={label}
      className={className}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin programar";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatBytes(value?: number | null) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
