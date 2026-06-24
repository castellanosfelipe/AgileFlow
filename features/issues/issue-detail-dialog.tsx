"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Clock,
  FileText,
  History,
  Link2,
  Lock,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  Unlock,
  Save
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
import {
  AutoSaveMessage,
  type AutoSaveState
} from "@/features/issues/issue-detail-components";
import {
  SortableGridHeader,
  sortByState,
  type SortableValue,
  type SortState
} from "@/components/sortable-grid-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { formatJiraEstimate, parseJiraEstimate } from "@/lib/time-estimate";
import type {
  AuditLogDTO,
  CurrentUserDTO,
  EpicDTO,
  IssueAttachmentDTO,
  IssueBlockerDTO,
  IssueCommentDTO,
  IssueDetailDTO,
  IssueDTO,
  IssueSummaryDTO,
  IssueStatus,
  IssueWorklogDTO,
  SprintDTO,
  UserDTO
} from "@/lib/types";
import { formatDate, initials } from "@/lib/utils";

type IssueDetailDialogProps = {
  issueId: string | null;
  currentUser: CurrentUserDTO | null;
  users: UserDTO[];
  epics: EpicDTO[];
  sprints: SprintDTO[];
  onClose: () => void;
  onChanged?: () => void;
  onOpenIssue?: (issueId: string) => void;
};

type IssueSaveValues = {
  title: string;
  description: string;
  status: IssueStatus;
  assigneeId: string;
  epicId: string;
  sprintId: string;
  blockedByIssueId: string;
  isBlockedUntilDone: boolean;
  estimate: string;
  startDate: string;
  dueDate: string;
};

type IssueSaveField = keyof IssueSaveValues;
type DetailSubtaskSortKey = "code" | "title" | "status" | "assignee";
type AutoSaveField = Extract<
  IssueSaveField,
  | "status"
  | "epicId"
  | "sprintId"
  | "blockedByIssueId"
  | "isBlockedUntilDone"
>;

type IssueSaveRequest = {
  fields?: IssueSaveField[];
  overrides?: Partial<IssueSaveValues>;
  payload?: Record<string, unknown>;
};

const statusLabels: Record<IssueStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  DONE: "Finalizada"
};

const statusOptionClasses: Record<IssueStatus, string> = {
  TODO: "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
  IN_PROGRESS: "border-yellow-300 bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
  DONE: "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
};

const sprintStatusLabels: Record<SprintDTO["status"], string> = {
  PLANNED: "Planificado",
  ACTIVE: "Activo",
  COMPLETED: "Completado"
};

const fieldLabels: Record<string, string> = {
  title: "título",
  description: "descripción",
  status: "estado",
  assigneeId: "responsable",
  sprintId: "sprint",
  epicId: "épica",
  blockedByIssueId: "bloqueo",
  isBlockedUntilDone: "bloqueo total",
  estimate: "estimación original",
  timeSpent: "tiempo empleado",
  timeRemaining: "tiempo restante",
  timeSpentDescription: "descripción del tiempo empleado",
  loggedTime: "tiempo registrado",
  startDate: "fecha de inicio",
  dueDate: "fecha de vencimiento"
};

const actionLabels: Record<string, string> = {
  "issue.created": "Se creó esta tarea",
  "issue.updated": "Se actualizó esta tarea",
  "issue.status_changed": "El estado cambió",
  "issue.assignee_changed": "Se cambió el responsable",
  "issue.priority_changed": "Se actualizó la prioridad",
  "issue.moved": "Se movió esta tarea",
  "issue.commented": "Se agregó un comentario",
  "issue.attachment_added": "Se agregaron archivos adjuntos",
  "issue.attachment_deleted": "Se eliminó un archivo adjunto",
  "issue.subtask_created": "Se creó una subtarea",
  "issue.blocker_changed": "Se actualizó el bloqueo",
  "issue.blocker_added": "Se agregó una tarea bloqueante",
  "issue.blocker_updated": "Se actualizó una tarea bloqueante",
  "issue.blocker_removed": "Se quitó una tarea bloqueante",
  "issue.time_logged": "Se registró tiempo"
};

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(attachment: IssueAttachmentDTO) {
  return attachment.mimeType.startsWith("image/");
}

function getAuditFields(log: AuditLogDTO) {
  const oldValue =
    log.oldValue && typeof log.oldValue === "object"
      ? (log.oldValue as Record<string, unknown>)
      : {};
  const newValue =
    log.newValue && typeof log.newValue === "object"
      ? (log.newValue as Record<string, unknown>)
      : {};

  return Array.from(
    new Set([...Object.keys(oldValue), ...Object.keys(newValue)])
  )
    .filter((field) => field !== "priority" && field !== "type")
    .map((field) => ({
      field,
      from: oldValue[field],
      to: newValue[field]
    }));
}

function isSubtaskCreatedLog(log: AuditLogDTO) {
  if (log.action !== "issue.created") return false;
  if (!log.newValue || typeof log.newValue !== "object") return false;

  const newValue = log.newValue as Record<string, unknown>;
  return newValue.type === "SUBTASK" || newValue.type === "subtask";
}

function formatAuditValue({
  field,
  value,
  users,
  epics,
  sprints
}: {
  field: string;
  value: unknown;
  users: UserDTO[];
  epics: EpicDTO[];
  sprints: SprintDTO[];
}) {
  if (field === "sprintId" && (value === null || value === undefined || value === "")) {
    return "Backlog";
  }

  if (value === null || value === undefined || value === "") return "sin valor";

  if (field === "assigneeId") {
    return users.find((user) => user.id === value)?.name ?? String(value);
  }

  if (field === "epicId") {
    return epics.find((epic) => epic.id === value)?.name ?? String(value);
  }

  if (field === "sprintId") {
    return sprints.find((sprint) => sprint.id === value)?.name ?? String(value);
  }

  if (field === "status") {
    return statusLabels[value as IssueStatus] ?? String(value);
  }

  if (field === "estimate" && typeof value === "number") {
    return formatJiraEstimate(value) || "sin estimación";
  }

  if (
    (field === "timeSpent" || field === "loggedTime") &&
    typeof value === "number"
  ) {
    return formatJiraEstimate(value) || "0m";
  }

  if (field === "timeRemaining" && typeof value === "number") {
    return formatJiraEstimate(value) || "0m";
  }

  if (field === "isBlockedUntilDone") {
    return value ? "sí" : "no";
  }

  if (field === "blockedByIssueId") {
    return String(value);
  }

  if ((field === "startDate" || field === "dueDate") && typeof value === "string") {
    return formatDate(value);
  }

  return String(value);
}

function formatAuditChange({
  label,
  from,
  to
}: {
  label: string;
  from: string;
  to: string;
}) {
  if (from === "sin valor") return `${label} quedó en ${to}`;
  if (to === "sin valor") return `${label} quedó sin valor`;
  return `${label} cambió de ${from} a ${to}`;
}

function formatAuditLine(
  log: AuditLogDTO,
  users: UserDTO[],
  epics: EpicDTO[],
  sprints: SprintDTO[]
) {
  if (log.action === "issue.commented") {
    return actionLabels[log.action];
  }

  if (log.action === "issue.created") {
    return isSubtaskCreatedLog(log)
      ? "Se creó esta subtarea"
      : actionLabels[log.action];
  }

  const changes = getAuditFields(log);
  const actionLabel = actionLabels[log.action] ?? log.action;

  if (changes.length) {
    const changeText = changes
      .map((change) => {
        const label = fieldLabels[change.field] ?? change.field;
        const from = formatAuditValue({
          field: change.field,
          value: change.from,
          users,
          epics,
          sprints
        });
        const to = formatAuditValue({
          field: change.field,
          value: change.to,
          users,
          epics,
          sprints
        });
        return formatAuditChange({ label, from, to });
      })
      .join("; ");

    return `${actionLabel}: ${changeText}`;
  }

  return actionLabel;
}

function getSubtaskPlanningRollup(issue: IssueDetailDTO | undefined) {
  if (!issue || issue.type !== "TASK" || !issue.subtasks.length) return null;

  const estimate = issue.subtasks.reduce(
    (total, subtask) => total + (subtask.estimate ?? 0),
    0
  );
  const startDates = issue.subtasks
    .map((subtask) => subtask.startDate)
    .filter((value): value is string => Boolean(value));
  const dueDates = issue.subtasks
    .map((subtask) => subtask.dueDate)
    .filter((value): value is string => Boolean(value));

  return {
    estimate,
    startDate: startDates.length
      ? startDates.reduce((oldest, current) =>
          new Date(current) < new Date(oldest) ? current : oldest
        )
      : issue.startDate,
    dueDate: dueDates.length
      ? dueDates.reduce((latest, current) =>
          new Date(current) > new Date(latest) ? current : latest
        )
      : issue.dueDate
  };
}

function hasIssueChanges({
  issue,
  title,
  description,
  status,
  assigneeId,
  epicId,
  sprintId,
  blockedByIssueId,
  isBlockedUntilDone,
  estimate,
  isPlanningInherited,
  startDate,
  dueDate
}: {
  issue: IssueDetailDTO | undefined;
  title: string;
  description: string;
  status: IssueStatus;
  assigneeId: string;
  epicId: string;
  sprintId: string;
  blockedByIssueId: string;
  isBlockedUntilDone: boolean;
  estimate: string;
  isPlanningInherited: boolean;
  startDate: string;
  dueDate: string;
}) {
  if (!issue) return false;
  const estimateMinutes = parseJiraEstimate(estimate);
  const nextEstimate = Number.isNaN(estimateMinutes) ? issue.estimate : estimateMinutes;

  return (
    title !== issue.title ||
    description !== (issue.description ?? "") ||
    status !== issue.status ||
    assigneeId !== issue.assigneeId ||
    epicId !== (issue.epicId ?? "") ||
    sprintId !== (issue.sprintId ?? "backlog") ||
    blockedByIssueId !== (issue.blockedByIssueId ?? "") ||
    isBlockedUntilDone !== issue.isBlockedUntilDone ||
    (!isPlanningInherited && nextEstimate !== issue.estimate) ||
    (!isPlanningInherited &&
      (startDate !== toDateInputValue(issue.startDate) ||
        dueDate !== toDateInputValue(issue.dueDate)))
  );
}

function isAutoSaveField(field: IssueSaveField): field is AutoSaveField {
  return (
    field === "status" ||
    field === "epicId" ||
    field === "sprintId" ||
    field === "blockedByIssueId" ||
    field === "isBlockedUntilDone"
  );
}

function getDetailSubtaskSortValue(
  subtask: IssueSummaryDTO,
  key: DetailSubtaskSortKey
): SortableValue {
  if (key === "code") return subtask.code;
  if (key === "title") return subtask.title;
  if (key === "status") return statusLabels[subtask.status];
  return subtask.assignee.name;
}

export function IssueDetailDialog({
  issueId,
  currentUser,
  users,
  epics,
  sprints,
  onClose,
  onChanged,
  onOpenIssue
}: IssueDetailDialogProps) {
  const queryClient = useQueryClient();
  const statusSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const statusBlurTimerRef = React.useRef<number | null>(null);
  const lastAutoSaveKeyRef = React.useRef<Partial<Record<IssueSaveField, string>>>({});
  const loadedIssueIdRef = React.useRef<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<IssueStatus>("TODO");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [epicId, setEpicId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("backlog");
  const [blockedByIssueId, setBlockedByIssueId] = React.useState("");
  const [isBlockedUntilDone, setIsBlockedUntilDone] = React.useState(false);
  const [estimate, setEstimate] = React.useState("");
  const [timeLogSpent, setTimeLogSpent] = React.useState("");
  const [timeLogDescription, setTimeLogDescription] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [isStatusEditing, setIsStatusEditing] = React.useState(false);
  const [isAssigneeEditing, setIsAssigneeEditing] = React.useState(false);
  const [isAttachmentDragging, setIsAttachmentDragging] = React.useState(false);
  const [isAddingBlocker, setIsAddingBlocker] = React.useState(false);
  const [assigneeSearch, setAssigneeSearch] = React.useState("");
  const [blockerSearch, setBlockerSearch] = React.useState("");
  const [commentBody, setCommentBody] = React.useState("");
  const [subtaskTitle, setSubtaskTitle] = React.useState("");
  const [subtaskSort, setSubtaskSort] = React.useState<
    SortState<DetailSubtaskSortKey>
  >({ key: "code", direction: "asc" });
  const [wasLinkCopied, setWasLinkCopied] = React.useState(false);
  const [autoSaveFeedback, setAutoSaveFeedback] = React.useState<
    Partial<Record<AutoSaveField, AutoSaveState>>
  >({});

  const detailQuery = useQuery({
    enabled: Boolean(issueId),
    queryKey: ["issue-detail", issueId],
    queryFn: () => apiFetch<IssueDetailDTO>(`/api/issues/${issueId}`)
  });

  const issue = detailQuery.data;
  const sortedSubtasks = React.useMemo(
    () =>
      sortByState(
        issue?.subtasks ?? [],
        subtaskSort,
        getDetailSubtaskSortValue
      ),
    [issue?.subtasks, subtaskSort]
  );
  const canEditIssue = Boolean(
    issue &&
      currentUser &&
      (currentUser.role === "admin" || issue.assigneeId === currentUser.id)
  );
  const canManageAssignee = Boolean(canEditIssue && currentUser?.role === "admin");

  const blockerOptionsQuery = useQuery({
    enabled: Boolean(issue?.id && issue.sprintId),
    queryKey: ["issue-blocker-options", issue?.id, blockerSearch],
    queryFn: () =>
      apiFetch<IssueSummaryDTO[]>(
        `/api/issues/${issue?.id}/blockers?q=${encodeURIComponent(
          blockerSearch.trim()
        )}`
      )
  });

  React.useEffect(() => {
    if (!issueId) {
      loadedIssueIdRef.current = null;
    }
  }, [issueId]);

  function refreshIssueAndLists() {
    queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
    queryClient.invalidateQueries({ queryKey: ["issue-blocker-options", issue?.id] });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
    queryClient.invalidateQueries({ queryKey: ["board"] });
    onChanged?.();
  }

  React.useEffect(() => {
    if (!issue) return;
    const planningRollup = getSubtaskPlanningRollup(issue);
    const isNewIssue = loadedIssueIdRef.current !== issue.id;

    loadedIssueIdRef.current = issue.id;

    setTitle(issue.title);
    setDescription(issue.description ?? "");
    setStatus(issue.status);
    setAssigneeId(issue.assigneeId);
    setEpicId(issue.epicId ?? "");
    setSprintId(issue.sprintId ?? "backlog");
    setBlockedByIssueId(issue.blockedByIssueId ?? "");
    setIsBlockedUntilDone(issue.isBlockedUntilDone);
    setEstimate(formatJiraEstimate(planningRollup?.estimate ?? issue.estimate));
    setStartDate(toDateInputValue(planningRollup?.startDate ?? issue.startDate));
    setDueDate(toDateInputValue(planningRollup?.dueDate ?? issue.dueDate));

    if (isNewIssue) {
      setTimeLogSpent("");
      setTimeLogDescription("");
      setIsStatusEditing(false);
      setIsAssigneeEditing(false);
      setIsAddingBlocker(false);
      setAssigneeSearch("");
      setBlockerSearch("");
      setSubtaskTitle("");
      setWasLinkCopied(false);
      setAutoSaveFeedback({});
      lastAutoSaveKeyRef.current = {};
    }
  }, [issue]);

  React.useEffect(() => {
    if (!isStatusEditing) return;
    const frameId = window.requestAnimationFrame(() => {
      statusSelectRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isStatusEditing]);

  React.useEffect(() => {
    return () => {
      if (statusBlurTimerRef.current) {
        window.clearTimeout(statusBlurTimerRef.current);
      }
    };
  }, []);

  function getIssueSaveValues(
    overrides: Partial<IssueSaveValues> = {}
  ): IssueSaveValues {
    return {
      title,
      description,
      status,
      assigneeId,
      epicId,
      sprintId,
      blockedByIssueId,
      isBlockedUntilDone,
      estimate,
      startDate,
      dueDate,
      ...overrides
    };
  }

  function addPayloadValue({
    field,
    payload,
    values
  }: {
    field: IssueSaveField;
    payload: Record<string, unknown>;
    values: IssueSaveValues;
  }) {
    if (!issue) return;

    if (field === "title" && values.title !== issue.title) {
      payload.title = values.title;
    }
    if (
      field === "description" &&
      values.description !== (issue.description ?? "")
    ) {
      payload.description = values.description.trim()
        ? values.description
        : null;
    }
    if (field === "status" && values.status !== issue.status) {
      payload.status = values.status;
    }
    if (field === "assigneeId" && values.assigneeId !== issue.assigneeId) {
      payload.assigneeId = values.assigneeId;
    }
    if (field === "epicId" && values.epicId !== (issue.epicId ?? "")) {
      payload.epicId = values.epicId || null;
    }
    if (field === "sprintId" && values.sprintId !== (issue.sprintId ?? "backlog")) {
      payload.sprintId = values.sprintId === "backlog" ? null : values.sprintId;
    }
    if (
      field === "blockedByIssueId" &&
      values.blockedByIssueId !== (issue.blockedByIssueId ?? "")
    ) {
      payload.blockedByIssueId = values.blockedByIssueId || null;
    }
    if (
      field === "isBlockedUntilDone" &&
      values.isBlockedUntilDone !== issue.isBlockedUntilDone
    ) {
      payload.isBlockedUntilDone = values.isBlockedUntilDone;
    }
    if (field === "estimate") {
      const estimateMinutes = parseJiraEstimate(values.estimate);
      if (
        !Number.isNaN(estimateMinutes) &&
        estimateMinutes !== issue.estimate
      ) {
        payload.estimate = estimateMinutes;
      }
    }
    if (field === "startDate" && values.startDate !== toDateInputValue(issue.startDate)) {
      payload.startDate = values.startDate;
    }
    if (field === "dueDate" && values.dueDate !== toDateInputValue(issue.dueDate)) {
      payload.dueDate = values.dueDate;
    }
  }

  const saveIssue = useMutation({
    onMutate: async ({ fields, overrides }: IssueSaveRequest = {}) => {
      const optimisticFields = fields ?? [];
      if (!issueId || !issue || !optimisticFields.length) return {};

      const previousIssue = queryClient.getQueryData<IssueDetailDTO>([
        "issue-detail",
        issueId
      ]);
      const values = getIssueSaveValues(overrides);

      queryClient.setQueryData<IssueDetailDTO>(
        ["issue-detail", issueId],
        (current) => {
          if (!current) return current;

          const nextIssue: IssueDetailDTO = { ...current };

          if (optimisticFields.includes("status")) {
            nextIssue.status = values.status;
          }

          if (optimisticFields.includes("epicId")) {
            nextIssue.epicId = values.epicId || null;
            nextIssue.epic =
              epics.find((epic) => epic.id === values.epicId) ?? null;
          }

          if (optimisticFields.includes("sprintId")) {
            const nextSprintId =
              values.sprintId === "backlog" ? null : values.sprintId;
            const isSprintChanging = nextSprintId !== current.sprintId;

            nextIssue.sprintId = nextSprintId;

            if (isSprintChanging) {
              nextIssue.blockedByIssueId = null;
              nextIssue.blockedByIssue = null;
              nextIssue.blockers = [];
              nextIssue.isBlockedUntilDone = false;
            }
          }

          if (optimisticFields.includes("blockedByIssueId")) {
            nextIssue.blockedByIssueId = values.blockedByIssueId || null;
            if (!values.blockedByIssueId) {
              nextIssue.blockedByIssue = null;
              nextIssue.isBlockedUntilDone = false;
            }
          }

          if (optimisticFields.includes("isBlockedUntilDone")) {
            nextIssue.isBlockedUntilDone = values.isBlockedUntilDone;
          }

          return nextIssue;
        }
      );

      return { previousIssue };
    },
    mutationFn: ({ fields, overrides, payload: preparedPayload }: IssueSaveRequest = {}) => {
      if (!issue) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes editar tareas asignadas a ti");
      }

      const fieldsToSave: IssueSaveField[] = (
        fields ?? [
          "title",
          "description",
          "status",
          "assigneeId",
          "epicId",
          "sprintId",
          "blockedByIssueId",
          "isBlockedUntilDone",
          "estimate",
          "startDate",
          "dueDate"
        ]
      ).filter(
        (field) =>
          !(
            isPlanningInherited &&
            (field === "estimate" ||
              field === "startDate" ||
              field === "dueDate")
          )
      );
      const payload: Record<string, unknown> = preparedPayload
        ? { ...preparedPayload }
        : {};

      if (!preparedPayload) {
        const values = getIssueSaveValues(overrides);
        for (const field of fieldsToSave) {
          addPayloadValue({ field, payload, values });
        }
      }

      if (!Object.keys(payload).length) {
        return Promise.resolve(issue);
      }

      return apiFetch<IssueDetailDTO>(`/api/issues/${issueId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },
    onSuccess: (updatedIssue, variables) => {
      const autoSavedFields = (variables?.fields ?? []).filter(isAutoSaveField);

      lastAutoSaveKeyRef.current = {};
      queryClient.setQueryData(["issue-detail", issueId], updatedIssue);
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
      queryClient.invalidateQueries({ queryKey: ["project-insights"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      setIsStatusEditing(false);
      setIsAssigneeEditing(false);
      setAssigneeSearch("");
      if (autoSavedFields.length) {
        setAutoSaveFeedback((current) => {
          const next = { ...current };
          for (const field of autoSavedFields) next[field] = "saved";
          return next;
        });

        window.setTimeout(() => {
          setAutoSaveFeedback((current) => {
            const next = { ...current };
            for (const field of autoSavedFields) {
              if (next[field] === "saved") delete next[field];
            }
            return next;
          });
        }, 1800);
      }
      onChanged?.();
    },
    onError: (_error, variables, context) => {
      if (context?.previousIssue) {
        queryClient.setQueryData(
          ["issue-detail", issueId],
          context.previousIssue
        );
      }

      for (const field of variables?.fields ?? []) {
        delete lastAutoSaveKeyRef.current[field];
        if (isAutoSaveField(field)) {
          setAutoSaveFeedback((current) => ({
            ...current,
            [field]: "error"
          }));
        }
        if (!issue) continue;
        if (field === "status") setStatus(issue.status);
        if (field === "epicId") setEpicId(issue.epicId ?? "");
        if (field === "sprintId") setSprintId(issue.sprintId ?? "backlog");
        if (field === "blockedByIssueId") {
          setBlockedByIssueId(issue.blockedByIssueId ?? "");
        }
        if (field === "isBlockedUntilDone") {
          setIsBlockedUntilDone(issue.isBlockedUntilDone);
        }
      }
    }
  });

  const addComment = useMutation({
    mutationFn: () => {
      if (!canEditIssue) {
        throw new Error("Solo puedes comentar tareas asignadas a ti");
      }

      return apiFetch<IssueCommentDTO>(`/api/issues/${issueId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body: commentBody
        })
      });
    },
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
    }
  });

  const addWorklog = useMutation({
    mutationFn: () => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes registrar tiempo en tareas asignadas a ti");
      }
      if (
        typeof timeLogSpentMinutes !== "number" ||
        Number.isNaN(timeLogSpentMinutes) ||
        timeLogSpentMinutes <= 0
      ) {
        throw new Error("Registra un tiempo mayor a 0");
      }

      return apiFetch<{
        worklog: IssueWorklogDTO;
        timeSpent: number;
        timeRemaining: number | null;
      }>(`/api/issues/${issueId}/worklogs`, {
        method: "POST",
        body: JSON.stringify({
          timeSpent: timeLogSpentMinutes,
          description: timeLogDescription
        })
      });
    },
    onSuccess: () => {
      setTimeLogSpent("");
      setTimeLogDescription("");
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      onChanged?.();
    }
  });

  const uploadAttachments = useMutation({
    mutationFn: async (files: File[]) => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes cargar adjuntos en tareas asignadas a ti");
      }

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch(`/api/issues/${issueId}/attachments`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined") {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        }

        const message = await response.text();
        throw new Error(message || "No se pudieron cargar los archivos");
      }

      return response.json() as Promise<IssueAttachmentDTO[]>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      onChanged?.();
    }
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachmentId: string) => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes eliminar adjuntos de tareas asignadas a ti");
      }

      const response = await fetch(
        `/api/issues/${issueId}/attachments?attachmentId=${encodeURIComponent(
          attachmentId
        )}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined") {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        }

        const message = await response.text();
        throw new Error(message || "No se pudo eliminar el adjunto");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      onChanged?.();
    }
  });

  const addBlocker = useMutation({
    mutationFn: (blockerIssueId: string) => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes modificar bloqueos de tareas asignadas a ti");
      }

      return apiFetch<IssueBlockerDTO>(`/api/issues/${issueId}/blockers`, {
        method: "POST",
        body: JSON.stringify({ blockerIssueId })
      });
    },
    onSuccess: () => {
      setBlockerSearch("");
      setIsAddingBlocker(false);
      refreshIssueAndLists();
    }
  });

  const updateBlocker = useMutation({
    mutationFn: ({
      blockerLinkId,
      isBlockingUntilDone
    }: {
      blockerLinkId: string;
      isBlockingUntilDone: boolean;
    }) => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes modificar bloqueos de tareas asignadas a ti");
      }

      return apiFetch<IssueBlockerDTO>(`/api/issues/${issueId}/blockers`, {
        method: "PATCH",
        body: JSON.stringify({
          blockerLinkId,
          isBlockingUntilDone
        })
      });
    },
    onSuccess: () => refreshIssueAndLists()
  });

  const removeBlocker = useMutation({
    mutationFn: async (blockerLinkId: string) => {
      if (!issueId) throw new Error("No hay tarea seleccionada");
      if (!canEditIssue) {
        throw new Error("Solo puedes modificar bloqueos de tareas asignadas a ti");
      }

      const response = await fetch(
        `/api/issues/${issueId}/blockers?blockerLinkId=${encodeURIComponent(
          blockerLinkId
        )}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined") {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        }

        const message = await response.text();
        throw new Error(message || "No se pudo quitar la tarea bloqueante");
      }
    },
    onSuccess: () => refreshIssueAndLists()
  });

  const createSubtask = useMutation({
    mutationFn: () =>
      !canEditIssue
        ? Promise.reject(
            new Error("Solo puedes crear subtareas en tareas asignadas a ti")
          )
        :
      apiFetch<IssueDTO>("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          title: subtaskTitle,
          parentIssueId: issue?.id,
          sprintId: issue?.sprintId ?? null,
          epicId: issue?.epicId ?? null,
          assigneeId: users.some((user) => user.id === assigneeId)
            ? assigneeId
            : null,
          type: "SUBTASK",
          status: "TODO",
          startDate: issue?.startDate,
          dueDate: issue?.dueDate
        })
      }),
    onSuccess: (createdIssue) => {
      setSubtaskTitle("");
      queryClient.invalidateQueries({ queryKey: ["issue-detail", issueId] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      onChanged?.();
      onOpenIssue?.(createdIssue.id);
    }
  });

  const planningRollup = getSubtaskPlanningRollup(issue);
  const isPlanningInherited = Boolean(planningRollup);

  const hasChanges = hasIssueChanges({
    issue,
    title,
    description,
    status,
    assigneeId,
    epicId,
    sprintId,
    blockedByIssueId,
    isBlockedUntilDone,
    estimate,
    isPlanningInherited,
    startDate,
    dueDate
  });

  const dateOrderError =
    startDate && dueDate && new Date(dueDate) < new Date(startDate)
      ? "La fecha de vencimiento no puede ser menor que la fecha de inicio"
      : null;
  const estimateMinutes = parseJiraEstimate(estimate);
  const estimateError = Number.isNaN(estimateMinutes)
    ? "Usa el formato 2w 4d 6h 45m"
    : null;
  const timeLogSpentMinutes = parseJiraEstimate(timeLogSpent);
  const timeLogSpentError = Number.isNaN(timeLogSpentMinutes)
    ? "Usa el formato 2w 4d 6h 45m"
    : timeLogSpent.trim() && !timeLogSpentMinutes
      ? "Registra un tiempo mayor a 0"
      : null;
  const timeLogDescriptionError =
    timeLogDescription.length > 1000
      ? "La descripción no puede superar 1000 caracteres"
      : timeLogSpent.trim() && !timeLogDescription.trim()
        ? "La descripción es obligatoria"
        : null;
  const trackedTime = issue?.timeSpent ?? 0;
  const remainingTime = issue?.timeRemaining ?? null;
  const progressTotal = estimateMinutes && estimateMinutes > 0 ? estimateMinutes : 0;
  const timeProgress = progressTotal
    ? Math.min(100, Math.round((trackedTime / progressTotal) * 100))
    : 0;
  const canRegisterTime =
    canEditIssue &&
    Boolean(issue) &&
    Boolean(timeLogSpent.trim()) &&
    typeof timeLogSpentMinutes === "number" &&
    !Number.isNaN(timeLogSpentMinutes) &&
    timeLogSpentMinutes > 0 &&
    Boolean(timeLogDescription.trim()) &&
    !timeLogSpentError &&
    !timeLogDescriptionError;
  const currentSprintStatus = sprints.find(
    (sprint) => sprint.id === issue?.sprintId
  )?.status;
  const isSprintSelectionLocked = currentSprintStatus === "COMPLETED";
  const selectedAssignee =
    users.find((user) => user.id === assigneeId) ?? issue?.assignee ?? null;
  const filteredAssigneeUsers = users
    .filter((user) => {
      const query = assigneeSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    })
    .slice(0, 8);
  const blockerOptions = blockerOptionsQuery.data ?? [];
  const blockers = issue?.blockers ?? [];
  const isBlockerMutationPending =
    addBlocker.isPending || updateBlocker.isPending || removeBlocker.isPending;
  const blockerMutationError =
    addBlocker.error ?? updateBlocker.error ?? removeBlocker.error;
  const shouldShowBlockerSearch = Boolean(
    canEditIssue && issue?.sprintId && (!blockers.length || isAddingBlocker)
  );
  const canCreateSubtasks =
    canEditIssue && Boolean(issue) && issue?.type === "TASK" && !issue.parentIssueId;

  function closeDialog() {
    if (
      saveIssue.isPending ||
      addComment.isPending ||
      addWorklog.isPending ||
      uploadAttachments.isPending ||
      deleteAttachment.isPending ||
      isBlockerMutationPending ||
      createSubtask.isPending
    ) {
      return;
    }
    onClose();
  }

  function saveIssueChanges() {
    if (
      !issue ||
      !canEditIssue ||
      !title.trim() ||
      !assigneeId ||
      !startDate ||
      !dueDate ||
      dateOrderError ||
      estimateError
    ) {
      return;
    }
    saveIssue.mutate({});
  }

  function getIssueFieldValue(field: IssueSaveField) {
    if (!issue) return "";

    if (field === "title") return issue.title;
    if (field === "description") return issue.description ?? "";
    if (field === "status") return issue.status;
    if (field === "assigneeId") return issue.assigneeId;
    if (field === "epicId") return issue.epicId ?? "";
    if (field === "sprintId") return issue.sprintId ?? "backlog";
    if (field === "blockedByIssueId") return issue.blockedByIssueId ?? "";
    if (field === "isBlockedUntilDone") return issue.isBlockedUntilDone;
    if (field === "estimate") return formatJiraEstimate(issue.estimate);
    if (field === "startDate") return toDateInputValue(issue.startDate);
    return toDateInputValue(issue.dueDate);
  }

  function saveAutoFields(
    fields: AutoSaveField[],
    overrides: Partial<IssueSaveValues> = {}
  ) {
    if (!issue || !canEditIssue) return;

    const values = getIssueSaveValues(overrides);
    const changedFields = fields.filter((field) => {
      const nextValue = values[field];
      if (nextValue === getIssueFieldValue(field)) return false;

      const autoSaveKey = `${issue.id}:${field}:${String(nextValue)}`;
      if (lastAutoSaveKeyRef.current[field] === autoSaveKey) return false;

      lastAutoSaveKeyRef.current[field] = autoSaveKey;
      return true;
    });

    if (!changedFields.length) return;

    const payload: Record<string, unknown> = {};
    for (const field of changedFields) {
      addPayloadValue({ field, payload, values });
    }

    if (!Object.keys(payload).length) return;

    setAutoSaveFeedback((current) => ({
      ...current,
      ...Object.fromEntries(changedFields.map((field) => [field, "saving"]))
    }));
    saveIssue.mutate({
      fields: changedFields,
      overrides,
      payload
    });
  }

  function saveDropdownField(
    field: AutoSaveField,
    overrides: Partial<IssueSaveValues> = {}
  ) {
    saveAutoFields([field], overrides);
  }

  async function copyIssueLink() {
    if (!issue || typeof window === "undefined") return;

    const url = new URL("/backlog", window.location.origin);
    url.searchParams.set("issueId", issue.id);
    const issueUrl = url.toString();

    try {
      await navigator.clipboard.writeText(issueUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = issueUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setWasLinkCopied(true);
    window.setTimeout(() => setWasLinkCopied(false), 1800);
  }

  function onAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue || !canEditIssue || !commentBody.trim()) return;
    addComment.mutate();
  }

  function onAddWorklog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRegisterTime) return;
    addWorklog.reset();
    addWorklog.mutate();
  }

  function uploadAttachmentFiles(files: File[]) {
    if (!issue || !canEditIssue || !files.length) return;
    uploadAttachments.mutate(files);
  }

  function onDropAttachments(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsAttachmentDragging(false);
    uploadAttachmentFiles(Array.from(event.dataTransfer.files));
  }

  function submitSubtask(
    event?: React.FormEvent | React.MouseEvent | React.KeyboardEvent
  ) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!issue || !canEditIssue || !canCreateSubtasks || !subtaskTitle.trim()) return;
    createSubtask.reset();
    createSubtask.mutate();
  }

  return (
    <Dialog open={Boolean(issueId)} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogClose onClose={closeDialog} />
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="min-w-0">
              <DialogTitle>{issue?.title ?? "Detalle de tarea"}</DialogTitle>
              <DialogDescription>
                {issue?.code ? (
                  <span className="ticket-code font-mono font-semibold text-primary">
                    {issue.code}
                  </span>
                ) : (
                  "Cargando detalle de la tarea"
                )}
              </DialogDescription>
            </div>
            {issue ? (
              <div className="flex shrink-0 items-center gap-2">
                {issue.parentIssue ? (
                  <Button
                    aria-label={`Volver a la tarea ${issue.parentIssue.code}`}
                    onClick={() => onOpenIssue?.(issue.parentIssue?.id ?? "")}
                    size="icon"
                    title={`Volver a la tarea ${issue.parentIssue.code}`}
                    type="button"
                    variant="outline"
                  >
                    <ArrowLeft />
                  </Button>
                ) : null}
                <Button
                  aria-label="Copiar link de la tarea"
                  onClick={copyIssueLink}
                  size="icon"
                  title="Copiar link de la tarea"
                  type="button"
                  variant="outline"
                >
                  {wasLinkCopied ? <Check /> : <Link2 />}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div
            aria-live="polite"
            className="grid min-h-48 place-items-center text-sm text-muted-foreground"
            role="status"
          >
            <span className="inline-flex items-center gap-2">
              <Loader2 className="animate-spin" />
              Cargando tarea...
            </span>
          </div>
        ) : null}

        {detailQuery.error ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            No se pudo cargar el detalle de la tarea.
          </p>
        ) : null}

        {issue ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            {!canEditIssue ? (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 lg:col-span-2"
                role="status"
              >
                Solo puedes consultar esta tarea. La edicion esta disponible para
                administradores o para la persona responsable.
              </div>
            ) : null}
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <div className="ticket-code rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm font-semibold text-primary">
                      {issue.code}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issue-detail-title">Título</Label>
                    <Input
                      disabled={!canEditIssue}
                      id="issue-detail-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issue-detail-description">Descripción</Label>
                  <Textarea
                    className="min-h-32"
                    disabled={!canEditIssue}
                    id="issue-detail-description"
                    placeholder="Agrega contexto para el equipo"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Adjuntos</h3>
                  </div>

                  <div
                    aria-label="Arrastrar y soltar adjuntos"
                    className={`grid min-h-28 place-items-center rounded-md border border-dashed bg-background p-4 text-center text-sm transition ${
                      isAttachmentDragging
                        ? "border-primary bg-primary/5 text-primary"
                        : "text-muted-foreground"
                    }`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (!canEditIssue) return;
                      setIsAttachmentDragging(true);
                    }}
                    onDragLeave={(event) => {
                      if (
                        event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      ) {
                        return;
                      }
                      setIsAttachmentDragging(false);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!canEditIssue) {
                        event.dataTransfer.dropEffect = "none";
                        return;
                      }
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={onDropAttachments}
                    role="region"
                  >
                    <div className="space-y-2">
                      {uploadAttachments.isPending ? (
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      ) : (
                        <Paperclip className="mx-auto size-5" />
                      )}
                      <p className="font-medium text-foreground">
                        Arrastra y suelta archivos aquí
                      </p>
                      <p className="text-xs">
                        Imágenes, PDF, documentos y otros archivos de soporte.
                      </p>
                    </div>
                  </div>

                  <div aria-live="polite" className="sr-only" role="status">
                    {uploadAttachments.isPending
                      ? "Cargando adjuntos"
                      : isAttachmentDragging
                        ? "Suelta los archivos para cargarlos"
                        : ""}
                  </div>

                  {uploadAttachments.error ? (
                    <p
                      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                      role="alert"
                    >
                      {uploadAttachments.error.message}
                    </p>
                  ) : null}

                  {deleteAttachment.error ? (
                    <p
                      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                      role="alert"
                    >
                      {deleteAttachment.error.message}
                    </p>
                  ) : null}

                  {issue.attachments.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {issue.attachments.map((attachment) => {
                        const isDeleting =
                          deleteAttachment.isPending &&
                          deleteAttachment.variables === attachment.id;

                        return (
                          <div
                            className="flex min-w-0 items-start gap-2 rounded-md border bg-background p-2 text-sm"
                            key={attachment.id}
                          >
                            <a
                              className="flex min-w-0 flex-1 gap-3 transition hover:text-primary"
                              href={attachment.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                                {isImageAttachment(attachment) ? (
                                  <img
                                    alt={attachment.name}
                                    className="h-full w-full object-cover"
                                    src={attachment.url}
                                  />
                                ) : (
                                  <FileText className="size-5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {attachment.name}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatFileSize(attachment.size)} ·{" "}
                                  {attachment.uploader.name}
                                </p>
                              </div>
                            </a>
                            <Button
                              aria-label={`Eliminar adjunto ${attachment.name}`}
                              disabled={!canEditIssue || deleteAttachment.isPending}
                              onClick={() => deleteAttachment.mutate(attachment.id)}
                              size="icon"
                              title="Eliminar adjunto"
                              type="button"
                              variant="ghost"
                            >
                              {isDeleting ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                      Sin adjuntos. Arrastra imágenes, PDFs, documentos u otros
                      archivos de soporte a la zona superior.
                    </p>
                  )}
                </section>

                {canCreateSubtasks ? (
                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Subtareas</h3>
                    <Badge variant="muted">{issue.subtasks.length}</Badge>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      aria-label="Título de subtarea"
                      disabled={!canEditIssue}
                      placeholder="Crear subtarea"
                      value={subtaskTitle}
                      onChange={(event) => setSubtaskTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          submitSubtask(event);
                        }
                      }}
                    />
                    <Button
                      disabled={
                        subtaskTitle.trim().length < 3 ||
                        !canEditIssue ||
                        createSubtask.isPending
                      }
                      onClick={submitSubtask}
                      type="button"
                      variant="outline"
                    >
                      {createSubtask.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus />
                      )}
                      Crear
                    </Button>
                  </div>

                  {createSubtask.error ? (
                    <p
                      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                      role="alert"
                    >
                      {createSubtask.error.message || "No se pudo crear la subtarea"}
                    </p>
                  ) : null}

                  {issue.subtasks.length ? (
                    <div className="divide-y rounded-md border bg-background">
                      <div className="hidden gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[90px_minmax(0,1fr)_120px_120px]">
                        <SortableGridHeader
                          label="Codigo"
                          onSortChange={setSubtaskSort}
                          sortKey="code"
                          sortState={subtaskSort}
                        />
                        <SortableGridHeader
                          label="Titulo"
                          onSortChange={setSubtaskSort}
                          sortKey="title"
                          sortState={subtaskSort}
                        />
                        <SortableGridHeader
                          label="Estado"
                          onSortChange={setSubtaskSort}
                          sortKey="status"
                          sortState={subtaskSort}
                        />
                        <SortableGridHeader
                          label="Responsable"
                          onSortChange={setSubtaskSort}
                          sortKey="assignee"
                          sortState={subtaskSort}
                        />
                      </div>
                      {sortedSubtasks.map((subtask) => (
                        <button
                          className="grid w-full gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted/40 sm:grid-cols-[90px_minmax(0,1fr)_120px_120px]"
                          key={subtask.id}
                          onClick={() => onOpenIssue?.(subtask.id)}
                          type="button"
                        >
                          <span className="ticket-code font-mono text-xs font-semibold text-primary">
                            {subtask.code}
                          </span>
                          <span className="min-w-0 truncate font-medium">
                            {subtask.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {statusLabels[subtask.status]}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {subtask.assignee.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                      Sin subtareas.
                    </p>
                  )}
                </section>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="issue-detail-sprint">Sprint</Label>
                    <Select
                      disabled={!canEditIssue || isSprintSelectionLocked}
                      id="issue-detail-sprint"
                      value={sprintId}
                      onBlur={() => saveDropdownField("sprintId")}
                      onChange={(event) => {
                        const nextSprintId = event.target.value;
                        setSprintId(nextSprintId);
                        if (blockedByIssueId) {
                          setBlockedByIssueId("");
                          setIsBlockedUntilDone(false);
                        }
                        saveDropdownField("sprintId", {
                          sprintId: nextSprintId,
                          blockedByIssueId: "",
                          isBlockedUntilDone: false
                        });
                      }}
                    >
                      <option value="backlog">Backlog</option>
                      {sprints.map((sprint) => (
                        <option
                          disabled={
                            sprint.status === "COMPLETED" &&
                            sprint.id !== issue.sprintId
                          }
                          key={sprint.id}
                          value={sprint.id}
                        >
                          {sprint.name} - {sprintStatusLabels[sprint.status]}
                        </option>
                      ))}
                    </Select>
                    <AutoSaveMessage state={autoSaveFeedback.sprintId} />
                    {isSprintSelectionLocked ? (
                      <p className="text-xs text-muted-foreground">
                        No se pueden mover tareas de un sprint completado.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="issue-detail-estimate">
                      Estimación original
                    </Label>
                    <Input
                      aria-describedby="issue-detail-estimate-help"
                      aria-invalid={Boolean(estimateError)}
                      disabled={!canEditIssue || isPlanningInherited}
                      id="issue-detail-estimate"
                      placeholder="2w 4d 6h 45m"
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                    />
                    <p
                      className={
                        estimateError
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                      id="issue-detail-estimate-help"
                      role={estimateError ? "alert" : undefined}
                    >
                      {estimateError ??
                        (isPlanningInherited
                          ? "Calculada con la suma de la estimación original de las subtareas."
                          : "Formato permitido: 2w 4d 6h 45m.")}
                    </p>
                  </div>

                  <form
                    className="space-y-3 rounded-md border bg-background p-3 sm:col-span-2"
                    onSubmit={onAddWorklog}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Seguimiento de tiempo
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {trackedTime > 0
                            ? `Registrado: ${formatJiraEstimate(trackedTime)}`
                            : "Sin tiempo registrado"}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs font-medium text-muted-foreground">
                        Restante:{" "}
                        {remainingTime === null
                          ? "Sin registrar"
                          : formatJiraEstimate(remainingTime) || "0m"}
                      </p>
                    </div>

                    <div
                      aria-label={`Tiempo consumido ${timeProgress}%`}
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={timeProgress}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${timeProgress}%` }}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="issue-detail-time-spent">
                          Tiempo empleado
                        </Label>
                        <Input
                          aria-describedby="issue-detail-time-spent-help"
                          aria-invalid={Boolean(timeLogSpentError)}
                          disabled={!canEditIssue}
                          id="issue-detail-time-spent"
                          placeholder="1h 30m"
                          value={timeLogSpent}
                          onChange={(event) =>
                            setTimeLogSpent(event.target.value)
                          }
                        />
                        <p
                          className={
                            timeLogSpentError
                              ? "text-xs text-destructive"
                              : "text-xs text-muted-foreground"
                          }
                          id="issue-detail-time-spent-help"
                          role={timeLogSpentError ? "alert" : undefined}
                        >
                          {timeLogSpentError ??
                            "Tiempo nuevo que vas a registrar."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="issue-detail-time-remaining-display">
                          Tiempo restante
                        </Label>
                        <div
                          className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm"
                          id="issue-detail-time-remaining-display"
                        >
                          {remainingTime === null
                            ? "Sin registrar"
                            : formatJiraEstimate(remainingTime) || "0m"}
                        </div>
                        <p
                          className="text-xs text-muted-foreground"
                          id="issue-detail-time-remaining-help"
                        >
                          Se recalcula automaticamente con cada registro.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="issue-detail-time-spent-description">
                        Descripción del tiempo empleado
                      </Label>
                      <Textarea
                        aria-describedby="issue-detail-time-spent-description-help"
                        aria-invalid={Boolean(timeLogDescriptionError)}
                        disabled={!canEditIssue}
                        id="issue-detail-time-spent-description"
                        placeholder="Describe qué se hizo durante este tiempo"
                        value={timeLogDescription}
                        onChange={(event) =>
                          setTimeLogDescription(event.target.value)
                        }
                      />
                      <p
                        className={
                          timeLogDescriptionError
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                        id="issue-detail-time-spent-description-help"
                        role={timeLogDescriptionError ? "alert" : undefined}
                      >
                        {timeLogDescriptionError ??
                          "Cuenta brevemente qué se hizo en el tiempo registrado."}
                      </p>
                    </div>

                    {addWorklog.error ? (
                      <p
                        className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                        role="alert"
                      >
                        {addWorklog.error.message ||
                          "No se pudo registrar el tiempo"}
                      </p>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        disabled={!canRegisterTime || addWorklog.isPending}
                        size="sm"
                        type="submit"
                      >
                        {addWorklog.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Clock />
                        )}
                        Registrar tiempo
                      </Button>
                    </div>

                    <div className="border-t pt-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Registros de tiempo
                      </h4>
                      {issue.worklogs.length ? (
                        <div className="mt-3 space-y-3">
                          {issue.worklogs.map((worklog) => (
                            <div
                              className="rounded-md border bg-muted/20 p-3"
                              key={worklog.id}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">
                                  {formatJiraEstimate(worklog.timeSpent) || "0m"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {worklog.author.name} -{" "}
                                  {formatDate(worklog.createdAt)}
                                </p>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                {worklog.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Todavia no hay tiempo registrado.
                        </p>
                      )}
                    </div>
                  </form>

                  <div className="space-y-2">
                    <Label htmlFor="issue-detail-start-date">Fecha de inicio</Label>
                    <Input
                      id="issue-detail-start-date"
                      disabled={!canEditIssue || isPlanningInherited}
                      required
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                    {isPlanningInherited ? (
                      <p className="text-xs text-muted-foreground">
                        Heredada de la fecha de inicio más antigua de las
                        subtareas.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="issue-detail-due-date">Fecha de vencimiento</Label>
                    <Input
                      id="issue-detail-due-date"
                      disabled={!canEditIssue || isPlanningInherited}
                      required
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                    {isPlanningInherited ? (
                      <p className="text-xs text-muted-foreground">
                        Heredada de la fecha de vencimiento más futura de las
                        subtareas.
                      </p>
                    ) : null}
                  </div>
                </div>

                {dateOrderError ? (
                  <p
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {dateOrderError}
                  </p>
                ) : null}

                {saveIssue.error ? (
                  <p
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {saveIssue.error.message || "No se pudo guardar la tarea"}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    disabled={
                      !hasChanges ||
                      !canEditIssue ||
                      saveIssue.isPending ||
                      !startDate ||
                      !dueDate ||
                      Boolean(dateOrderError) ||
                      Boolean(estimateError)
                    }
                    onClick={saveIssueChanges}
                    type="button"
                  >
                    {saveIssue.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    Guardar cambios
                  </Button>
                </div>
              </div>

              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Comentarios</h3>
                </div>

                <form className="space-y-2" onSubmit={onAddComment}>
                  <Textarea
                    aria-label="Nuevo comentario"
                    disabled={!canEditIssue}
                    placeholder="Escribe un comentario"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                  />
                  {addComment.error ? (
                    <p className="text-sm text-destructive" role="alert">
                      {addComment.error.message || "No se pudo agregar el comentario"}
                    </p>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      disabled={
                        !canEditIssue || !commentBody.trim() || addComment.isPending
                      }
                      size="sm"
                      type="submit"
                    >
                      {addComment.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <MessageSquare />
                      )}
                      Agregar comentario
                    </Button>
                  </div>
                </form>

                <div className="space-y-3">
                  {issue.comments.length ? (
                    issue.comments.map((comment) => (
                      <div className="rounded-md border p-3" key={comment.id}>
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-2 font-medium text-foreground">
                            <span className="grid size-6 place-items-center rounded-md bg-secondary text-[10px]">
                              {initials(comment.author.name)}
                            </span>
                            {comment.author.name}
                          </span>
                          <span>{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {comment.body}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Sin comentarios.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <section className="space-y-4 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label>Estado</Label>
                  {!isStatusEditing ? (
                    <button
                      aria-controls="issue-status-select"
                      aria-expanded={isStatusEditing}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusOptionClasses[status]}`}
                      disabled={!canEditIssue}
                      onClick={() => setIsStatusEditing(true)}
                      type="button"
                    >
                      <span>{statusLabels[status]}</span>
                      <span className="text-xs font-normal">Editar</span>
                    </button>
                  ) : (
                    <div className="space-y-2" id="issue-status-select">
                      <Select
                        aria-label="Seleccionar estado"
                        className={statusOptionClasses[status]}
                        disabled={!canEditIssue}
                        ref={statusSelectRef}
                        value={status}
                        onBlur={() => {
                          statusBlurTimerRef.current = window.setTimeout(() => {
                            saveDropdownField("status");
                            setIsStatusEditing(false);
                            statusBlurTimerRef.current = null;
                          }, 150);
                        }}
                        onChange={(event) => {
                          if (statusBlurTimerRef.current) {
                            window.clearTimeout(statusBlurTimerRef.current);
                            statusBlurTimerRef.current = null;
                          }
                          const nextStatus = event.target.value as IssueStatus;
                          setStatus(nextStatus);
                          setIsStatusEditing(false);
                          saveDropdownField("status", {
                            status: nextStatus
                          });
                        }}
                      >
                        <option className="bg-zinc-100 text-zinc-700" value="TODO">
                          Por hacer
                        </option>
                        <option
                          className="bg-yellow-100 text-yellow-800"
                          value="IN_PROGRESS"
                        >
                          En curso
                        </option>
                        <option
                          className="bg-emerald-100 text-emerald-800"
                          value="DONE"
                        >
                          Finalizada
                        </option>
                      </Select>
                    </div>
                  )}
                  <AutoSaveMessage state={autoSaveFeedback.status} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issue-detail-epic">Épica</Label>
                  <Select
                    disabled={!canEditIssue}
                    id="issue-detail-epic"
                    value={epicId}
                    onBlur={() => saveDropdownField("epicId")}
                    onChange={(event) => {
                      const nextEpicId = event.target.value;
                      setEpicId(nextEpicId);
                      saveDropdownField("epicId", {
                        epicId: nextEpicId
                      });
                    }}
                  >
                    <option value="">Sin épica</option>
                    {epics.map((epic) => (
                      <option key={epic.id} value={epic.id}>
                        {epic.key} - {epic.name}
                      </option>
                    ))}
                  </Select>
                  <AutoSaveMessage state={autoSaveFeedback.epicId} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="issue-detail-blocked-by">Bloqueada por</Label>
                    {issue.sprintId && blockers.length ? (
                      <Button
                        disabled={
                          !canEditIssue || isAddingBlocker || addBlocker.isPending
                        }
                        onClick={() => setIsAddingBlocker(true)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus />
                        Agregar
                      </Button>
                    ) : null}
                  </div>

                  {!issue.sprintId ? (
                    <p className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
                      Asigna esta tarea a un sprint para buscar tareas o subtareas
                      bloqueantes.
                    </p>
                  ) : null}

                  {blockers.length ? (
                    <div className="space-y-2">
                      {blockers.map((blocker) => {
                        const toggleIsPending =
                          updateBlocker.isPending &&
                          updateBlocker.variables?.blockerLinkId === blocker.id;
                        const removeIsPending =
                          removeBlocker.isPending &&
                          removeBlocker.variables === blocker.id;

                        return (
                          <div
                            className="rounded-md border bg-background p-2 text-sm"
                            key={blocker.id}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                className="min-w-0 flex-1 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => onOpenIssue?.(blocker.blockerIssue.id)}
                                type="button"
                              >
                                <span className="ticket-code block font-mono text-xs font-semibold text-primary">
                                  {blocker.blockerIssue.code}
                                </span>
                                <span className="block truncate font-medium">
                                  {blocker.blockerIssue.title}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {blocker.blockerIssue.type === "SUBTASK"
                                    ? "Subtarea"
                                    : "Tarea"}{" "}
                                  · {statusLabels[blocker.blockerIssue.status]}
                                </span>
                              </button>

                              <Button
                                aria-label={
                                  blocker.isBlockingUntilDone
                                    ? "Quitar bloqueo total"
                                    : "Activar bloqueo total"
                                }
                                disabled={
                                  !canEditIssue ||
                                  toggleIsPending ||
                                  removeIsPending
                                }
                                onClick={() =>
                                  updateBlocker.mutate({
                                    blockerLinkId: blocker.id,
                                    isBlockingUntilDone:
                                      !blocker.isBlockingUntilDone
                                  })
                                }
                                size="icon"
                                title={
                                  blocker.isBlockingUntilDone
                                    ? "Bloqueo total activo"
                                    : "Bloqueo informativo"
                                }
                                type="button"
                                variant={
                                  blocker.isBlockingUntilDone ? "secondary" : "ghost"
                                }
                              >
                                {toggleIsPending ? (
                                  <Loader2 className="animate-spin" />
                                ) : blocker.isBlockingUntilDone ? (
                                  <Lock />
                                ) : (
                                  <Unlock />
                                )}
                              </Button>

                              <Button
                                aria-label={`Quitar bloqueo ${blocker.blockerIssue.code}`}
                                disabled={
                                  !canEditIssue ||
                                  removeIsPending ||
                                  toggleIsPending
                                }
                                onClick={() => removeBlocker.mutate(blocker.id)}
                                size="icon"
                                title="Quitar tarea bloqueante"
                                type="button"
                                variant="ghost"
                              >
                                {removeIsPending ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Trash2 />
                                )}
                              </Button>
                            </div>

                            {blocker.isBlockingUntilDone ? (
                              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                Bloqueo total: esta tarea no puede avanzar hasta que
                                la bloqueante quede finalizada.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : issue.sprintId && !shouldShowBlockerSearch ? (
                    <p className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
                      No hay tareas bloqueantes seleccionadas.
                    </p>
                  ) : null}

                  {shouldShowBlockerSearch ? (
                    <div className="space-y-2">
                      <Input
                        disabled={!canEditIssue}
                        id="issue-detail-blocked-by"
                        placeholder="Buscar tarea o subtarea del sprint"
                        value={blockerSearch}
                        onChange={(event) => setBlockerSearch(event.target.value)}
                      />

                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
                        {blockerOptionsQuery.isLoading ? (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            Buscando tareas del sprint...
                          </p>
                        ) : blockerOptions.length ? (
                          blockerOptions.map((option) => (
                            <button
                              className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              disabled={!canEditIssue || addBlocker.isPending}
                              key={option.id}
                              onClick={() => addBlocker.mutate(option.id)}
                              type="button"
                            >
                              <span className="min-w-0">
                                <span className="ticket-code block font-mono text-xs font-semibold text-primary">
                                  {option.code}
                                </span>
                                <span className="block truncate font-medium">
                                  {option.title}
                                </span>
                              </span>
                              <Badge variant="muted">
                                {option.type === "SUBTASK" ? "Subtarea" : "Tarea"}
                              </Badge>
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            No encontramos tareas del sprint con ese texto.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {blockerMutationError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {blockerMutationError.message ||
                        "No se pudo actualizar el bloqueo"}
                    </p>
                  ) : null}

                  {isBlockerMutationPending ? (
                    <p className="text-xs text-muted-foreground">
                      Guardando bloqueo...
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-md border bg-muted/20 p-3">
                <h3 className="text-sm font-semibold">Resumen</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Responsable
                    </dt>
                    <dd className="mt-1 space-y-2">
                      {!isAssigneeEditing ? (
                        <button
                          className="inline-flex max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={!canManageAssignee}
                          onClick={() => {
                            if (!canManageAssignee) return;
                            setIsAssigneeEditing(true);
                            setAssigneeSearch("");
                          }}
                          type="button"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground">
                            {initials(selectedAssignee?.name ?? "")}
                          </span>
                          <span className="min-w-0 truncate">
                            {selectedAssignee?.name ?? "Sin responsable"}
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            aria-label="Buscar responsable"
                            autoFocus
                            disabled={!canManageAssignee}
                            placeholder="Buscar responsable"
                            value={assigneeSearch}
                            onChange={(event) =>
                              setAssigneeSearch(event.target.value)
                            }
                          />
                          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
                            {filteredAssigneeUsers.length ? (
                              filteredAssigneeUsers.map((user) => (
                                <button
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted ${
                                    user.id === assigneeId ? "bg-muted" : ""
                                  }`}
                                  disabled={!canManageAssignee}
                                  key={user.id}
                                  onClick={() => {
                                    setAssigneeId(user.id);
                                    setIsAssigneeEditing(false);
                                    setAssigneeSearch("");
                                  }}
                                  type="button"
                                >
                                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground">
                                    {initials(user.name)}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium">
                                      {user.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {user.email}
                                    </span>
                                  </span>
                                </button>
                              ))
                            ) : (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                No hay usuarios con ese nombre.
                              </p>
                            )}
                          </div>
                          <Button
                            onClick={() => {
                              setIsAssigneeEditing(false);
                              setAssigneeSearch("");
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                      {assigneeId !== issue.assigneeId ? (
                        <p className="text-xs text-muted-foreground">
                          Cambio pendiente de guardar.
                        </p>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Reportador
                    </dt>
                    <dd className="mt-1">{issue.reporter.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Creado
                    </dt>
                    <dd className="mt-1">{formatDate(issue.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Actualizado
                    </dt>
                    <dd className="mt-1">{formatDate(issue.updatedAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Historial</h3>
                </div>
                <div className="mt-3 space-y-3">
                  {issue.auditLogs.length ? (
                    issue.auditLogs.map((log) => (
                      <div className="border-l-2 border-border pl-3" key={log.id}>
                        <p className="text-sm">
                          {formatAuditLine(log, users, epics, sprints)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.user?.name ?? "Sistema"} · {formatDate(log.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin cambios registrados.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
