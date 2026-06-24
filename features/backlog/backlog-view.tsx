"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FolderArchive,
  Loader2,
  Plus,
  Search
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  BacklogSection,
  SprintSection,
  type SprintWithIssues
} from "@/features/backlog/backlog-components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { sprintCreateSchema } from "@/lib/schemas";
import type {
  BacklogDTO,
  IssueDTO,
  IssueStatus,
  SprintDTO
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const IssueDetailDialog = dynamic(
  () =>
    import("@/features/issues/issue-detail-dialog").then(
      (mod) => mod.IssueDetailDialog
    ),
  { ssr: false }
);

type SprintFormErrors = Partial<
  Record<"name" | "startsAt" | "endsAt" | "goal" | "form", string>
>;

type SprintActionPayload =
  | { id: string; action: "start" }
  | {
      id: string;
      action: "complete";
      movePendingTo: "backlog" | "sprint";
      targetSprintId: string | null;
    };

const issueStatusLabels: Record<IssueStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  DONE: "Finalizada"
};

function buildBacklogUrl(search: string, status: string, assigneeId: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (status !== "ALL") params.set("status", status);
  if (assigneeId !== "ALL") params.set("assigneeId", assigneeId);
  const query = params.toString();
  return `/api/backlog${query ? `?${query}` : ""}`;
}

export function BacklogView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<IssueStatus | "ALL">("ALL");
  const [assigneeId, setAssigneeId] = React.useState("ALL");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [isSprintModalOpen, setIsSprintModalOpen] = React.useState(false);
  const [sprintName, setSprintName] = React.useState("");
  const [sprintStartsAt, setSprintStartsAt] = React.useState("");
  const [sprintEndsAt, setSprintEndsAt] = React.useState("");
  const [sprintGoal, setSprintGoal] = React.useState("");
  const [sprintErrors, setSprintErrors] = React.useState<SprintFormErrors>({});
  const [sprintActionError, setSprintActionError] = React.useState<string | null>(
    null
  );
  const [sprintToComplete, setSprintToComplete] =
    React.useState<SprintWithIssues | null>(null);
  const [completeMovePendingTo, setCompleteMovePendingTo] =
    React.useState<"backlog" | "sprint">("backlog");
  const [completeTargetSprintId, setCompleteTargetSprintId] =
    React.useState("");
  const [completeSprintError, setCompleteSprintError] = React.useState<
    string | null
  >(null);
  const [issueTitle, setIssueTitle] = React.useState("");
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(
    null
  );
  const [feedbackMessage, setFeedbackMessage] = React.useState("");

  const backlogQuery = useQuery({
    queryKey: ["backlog", search, status, assigneeId],
    queryFn: () =>
      apiFetch<BacklogDTO>(buildBacklogUrl(search, status, assigneeId))
  });

  const data = backlogQuery.data;
  const currentUser = data?.currentUser ?? null;
  const canManageProject = currentUser?.role === "admin";
  const sprints = data?.sprints ?? [];
  const activeAndPlannedSprints = sprints.filter(
    (sprint) => sprint.status !== "COMPLETED"
  );
  const completedSprints = sprints.filter(
    (sprint) => sprint.status === "COMPLETED"
  );
  const users = data?.users ?? [];
  const plannedSprintCount = sprints.filter(
    (sprint) => sprint.status === "PLANNED"
  ).length;
  const activeSprintCount = sprints.filter(
    (sprint) => sprint.status === "ACTIVE"
  ).length;
  const completedSprintCount = sprints.filter(
    (sprint) => sprint.status === "COMPLETED"
  ).length;
  const selectedAssignee = users.find((user) => user.id === assigneeId);
  const activeFilters = [
    search.trim() ? `Texto: ${search.trim()}` : null,
    status !== "ALL" ? `Estado: ${issueStatusLabels[status]}` : null,
    selectedAssignee ? `Responsable: ${selectedAssignee.name}` : null
  ].filter((filter): filter is string => Boolean(filter));

  React.useEffect(() => {
    if (!feedbackMessage) return;
    const timeoutId = window.setTimeout(() => setFeedbackMessage(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [feedbackMessage]);

  React.useEffect(() => {
    function syncIssueFromUrl() {
      setSelectedIssueId(new URLSearchParams(window.location.search).get("issueId"));
    }

    syncIssueFromUrl();
    window.addEventListener("popstate", syncIssueFromUrl);
    return () => window.removeEventListener("popstate", syncIssueFromUrl);
  }, []);

  function setIssueDetailUrl(issueId: string | null) {
    const params = new URLSearchParams(window.location.search);

    if (issueId) {
      params.set("issueId", issueId);
    } else {
      params.delete("issueId");
    }

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, {
      scroll: false
    });
    setSelectedIssueId(issueId);
  }

  React.useEffect(() => {
    if (!sprints.length) return;
    setExpanded((current) => {
      const next = { ...current };
      for (const sprint of sprints) {
        if (next[sprint.id] === undefined) {
          next[sprint.id] = false;
        }
      }
      if (next.backlog === undefined) next.backlog = false;
      if (next.completedSprintsArchive === undefined) {
        next.completedSprintsArchive = false;
      }
      return next;
    });
  }, [sprints]);

  const invalidateBacklog = () => {
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  };

  const createSprint = useMutation({
    mutationFn: (payload: {
      name: string;
      startsAt: string;
      endsAt: string;
      goal: string | null;
    }) =>
      apiFetch<SprintDTO>("/api/sprints", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      setSprintName("");
      setSprintStartsAt("");
      setSprintEndsAt("");
      setSprintGoal("");
      setSprintErrors({});
      setIsSprintModalOpen(false);
      setFeedbackMessage("Sprint creado correctamente.");
      invalidateBacklog();
    }
  });

  const updateSprint = useMutation({
    mutationFn: (payload: SprintActionPayload) =>
      apiFetch<SprintDTO>(`/api/sprints/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(
          payload.action === "start"
            ? { action: "start" }
            : {
                action: "complete",
                movePendingTo: payload.movePendingTo,
                targetSprintId: payload.targetSprintId
              }
        )
      }),
    onMutate: () => {
      setSprintActionError(null);
    },
    onError: (error) => {
      setSprintActionError(error.message || "No se pudo actualizar el sprint");
    },
    onSuccess: invalidateBacklog
  });

  const createIssue = useMutation({
    mutationFn: () =>
      apiFetch<IssueDTO>("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          title: issueTitle,
          type: "TASK",
          sprintId: null
        })
      }),
    onSuccess: (createdIssue) => {
      setIssueTitle("");
      setFeedbackMessage("Tarea creada correctamente.");
      setIssueDetailUrl(createdIssue.id);
      invalidateBacklog();
    }
  });

  function toggleSection(id: string) {
    setExpanded((current) => ({
      ...current,
      [id]: !current[id]
    }));
  }

  function onCreateSprint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSprintErrors({});

    const result = sprintCreateSchema.safeParse({
      name: sprintName,
      startsAt: sprintStartsAt,
      endsAt: sprintEndsAt,
      goal: sprintGoal || null
    });

    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      setSprintErrors({
        name: fields.name?.[0],
        startsAt: fields.startsAt?.[0],
        endsAt: fields.endsAt?.[0],
        goal: fields.goal?.[0]
      });
      return;
    }

    createSprint.mutate(
      {
        ...result.data,
        goal: result.data.goal ?? null
      },
      {
        onError: (error) => {
          setSprintErrors({
            form: error.message || "No se pudo crear el sprint"
          });
        }
      }
    );
  }

  function onCreateIssue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issueTitle.trim()) return;
    createIssue.mutate();
  }

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
    setAssigneeId("ALL");
    setFeedbackMessage("Filtros limpiados.");
  }

  function openCompleteSprintDialog(sprint: SprintWithIssues) {
    setSprintActionError(null);
    setCompleteSprintError(null);
    setCompleteMovePendingTo("backlog");
    setCompleteTargetSprintId("");
    setSprintToComplete(sprint);
  }

  function closeCompleteSprintDialog() {
    if (updateSprint.isPending) return;
    setSprintToComplete(null);
    setCompleteSprintError(null);
  }

  function onCompleteSprint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sprintToComplete) return;

    if (completeMovePendingTo === "sprint" && !completeTargetSprintId) {
      setCompleteSprintError("Selecciona un sprint planificado para los pendientes");
      return;
    }

    setCompleteSprintError(null);
    updateSprint.mutate(
      {
        id: sprintToComplete.id,
        action: "complete",
        movePendingTo: completeMovePendingTo,
        targetSprintId:
          completeMovePendingTo === "sprint" ? completeTargetSprintId : null
      },
      {
        onSuccess: () => {
          setSprintToComplete(null);
          setFeedbackMessage("Sprint completado correctamente.");
        },
        onError: (error) => {
          setCompleteSprintError(
            error.message || "No se pudo completar el sprint"
          );
        }
      }
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-md border bg-background p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Backlog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.project
              ? `${data.project.key} · ${data.project.name}`
              : "Backlog del proyecto"}
          </p>
          {data?.project ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="muted">{plannedSprintCount} planificados</Badge>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
                {activeSprintCount} activo
              </Badge>
              <Badge variant="muted">{completedSprintCount} completados</Badge>
              <Badge variant="muted">
                {data.backlogIssues.length} en backlog
              </Badge>
            </div>
          ) : null}
        </div>

        {canManageProject ? (
          <Button onClick={() => setIsSprintModalOpen(true)} type="button">
            <Plus />
            Crear sprint
          </Button>
        ) : null}
      </div>

      {canManageProject ? (
        <CreateSprintDialog
          endsAt={sprintEndsAt}
          errors={sprintErrors}
          goal={sprintGoal}
          isPending={createSprint.isPending}
          name={sprintName}
          onOpenChange={(open) => {
            setIsSprintModalOpen(open);
            if (!open && !createSprint.isPending) setSprintErrors({});
          }}
          onSubmit={onCreateSprint}
          open={isSprintModalOpen}
          setEndsAt={setSprintEndsAt}
          setGoal={setSprintGoal}
          setName={setSprintName}
          setStartsAt={setSprintStartsAt}
          startsAt={sprintStartsAt}
        />
      ) : null}

      {canManageProject ? (
        <CompleteSprintDialog
          error={completeSprintError}
          isPending={updateSprint.isPending}
          movePendingTo={completeMovePendingTo}
          onClose={closeCompleteSprintDialog}
          onMovePendingToChange={setCompleteMovePendingTo}
          onSubmit={onCompleteSprint}
          onTargetSprintChange={setCompleteTargetSprintId}
          open={Boolean(sprintToComplete)}
          plannedSprints={sprints.filter(
            (sprint) =>
              sprint.status === "PLANNED" && sprint.id !== sprintToComplete?.id
          )}
          sprint={sprintToComplete}
          targetSprintId={completeTargetSprintId}
        />
      ) : null}

      <IssueDetailDialog
        currentUser={currentUser}
        epics={data?.epics ?? []}
        issueId={selectedIssueId}
        onChanged={invalidateBacklog}
        onClose={() => setIssueDetailUrl(null)}
        onOpenIssue={setIssueDetailUrl}
        sprints={sprints}
        users={users}
      />

      {feedbackMessage ? (
        <div
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {feedbackMessage}
        </div>
      ) : null}

      <Card className="bg-muted/20 shadow-none">
        <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(240px,1fr)_180px_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar tareas"
              className="pl-9"
              placeholder="Buscar por código, título o épica"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Select
            aria-label="Filtro por estado"
            value={status}
            onChange={(event) => setStatus(event.target.value as IssueStatus | "ALL")}
          >
            <option value="ALL">Todos los estados</option>
            <option value="TODO">Por hacer</option>
            <option value="IN_PROGRESS">En curso</option>
            <option value="DONE">Finalizada</option>
          </Select>
          <Select
            aria-label="Filtro por responsable"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="ALL">Todos los responsables</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <Button
            disabled={!activeFilters.length}
            onClick={clearFilters}
            type="button"
            variant="outline"
          >
            Limpiar
          </Button>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            {activeFilters.length ? (
              activeFilters.map((filter) => (
                <Badge key={filter} variant="muted">
                  {filter}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                Sin filtros aplicados.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {backlogQuery.isLoading ? (
        <div
          aria-live="polite"
          className="rounded-md border p-6 text-sm text-muted-foreground"
          role="status"
        >
          Cargando backlog...
        </div>
      ) : null}

      {backlogQuery.error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          No se pudo cargar el backlog.
        </div>
      ) : null}

      {sprintActionError ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {sprintActionError}
        </div>
      ) : null}

      {!data?.project && !backlogQuery.isLoading ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No hay proyecto seed cargado. Ejecuta `npm run db:seed`.
        </div>
      ) : null}

      <div className="space-y-3">
        {activeAndPlannedSprints.map((sprint) => (
          <SprintSection
            expanded={Boolean(expanded[sprint.id])}
            canManageProject={canManageProject}
            isMutating={updateSprint.isPending}
            key={sprint.id}
            onComplete={() => openCompleteSprintDialog(sprint)}
            onStart={() =>
              updateSprint.mutate(
                { id: sprint.id, action: "start" },
                {
                  onSuccess: () => {
                    setFeedbackMessage("Sprint iniciado correctamente.");
                  }
                }
              )
            }
            onOpenIssue={setIssueDetailUrl}
            onToggle={() => toggleSection(sprint.id)}
            sprint={sprint}
          />
        ))}

        {completedSprints.length ? (
          <section className="overflow-hidden rounded-md border bg-background shadow-sm">
            <button
              aria-controls="completed-sprints-archive"
              aria-expanded={Boolean(expanded.completedSprintsArchive)}
              className="flex w-full items-center justify-between gap-3 border-b bg-muted/20 p-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toggleSection("completedSprintsArchive")}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                {expanded.completedSprintsArchive ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <FolderArchive className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    Sprints completados
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Carpeta de sprints archivados
                  </span>
                </span>
              </span>
              <Badge variant="muted">
                {completedSprints.length} archivados
              </Badge>
            </button>

            {expanded.completedSprintsArchive ? (
              <div
                className="space-y-3 bg-muted/10 p-3"
                id="completed-sprints-archive"
              >
                {completedSprints.map((sprint) => (
                  <SprintSection
                    expanded={Boolean(expanded[sprint.id])}
                    canManageProject={false}
                    isMutating={updateSprint.isPending}
                    key={sprint.id}
                    onComplete={() => openCompleteSprintDialog(sprint)}
                    onStart={() => undefined}
                    onOpenIssue={setIssueDetailUrl}
                    onToggle={() => toggleSection(sprint.id)}
                    sprint={sprint}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <BacklogSection
          error={createIssue.error?.message ?? null}
          expanded={expanded.backlog ?? false}
          issues={data?.backlogIssues ?? []}
          isCreating={createIssue.isPending}
          issueTitle={issueTitle}
          onCreateIssue={onCreateIssue}
          onOpenIssue={setIssueDetailUrl}
          onToggle={() => toggleSection("backlog")}
          setIssueTitle={setIssueTitle}
        />
      </div>
    </div>
  );
}

function CreateSprintDialog({
  open,
  name,
  startsAt,
  endsAt,
  goal,
  errors,
  isPending,
  onOpenChange,
  onSubmit,
  setName,
  setStartsAt,
  setEndsAt,
  setGoal
}: {
  open: boolean;
  name: string;
  startsAt: string;
  endsAt: string;
  goal: string;
  errors: SprintFormErrors;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  setName: (value: string) => void;
  setStartsAt: (value: string) => void;
  setEndsAt: (value: string) => void;
  setGoal: (value: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Crear sprint</DialogTitle>
          <DialogDescription>
            Define el rango de fechas y el objetivo inicial del sprint.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Nombre del sprint</Label>
            <Input
              aria-invalid={Boolean(errors.name)}
              id="sprint-name"
              placeholder="Sprint 4 - Entrega MVP"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sprint-starts-at">Fecha de inicio</Label>
              <Input
                aria-invalid={Boolean(errors.startsAt)}
                id="sprint-starts-at"
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              {errors.startsAt ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.startsAt}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sprint-ends-at">Fecha de fin</Label>
              <Input
                aria-invalid={Boolean(errors.endsAt)}
                id="sprint-ends-at"
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
              {errors.endsAt ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.endsAt}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Objetivo del sprint</Label>
            <Textarea
              aria-invalid={Boolean(errors.goal)}
              id="sprint-goal"
              placeholder="Objetivo opcional"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
            {errors.goal ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.goal}
              </p>
            ) : null}
          </div>

          {errors.form ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {errors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Guardar sprint
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteSprintDialog({
  open,
  sprint,
  plannedSprints,
  movePendingTo,
  targetSprintId,
  error,
  isPending,
  onClose,
  onSubmit,
  onMovePendingToChange,
  onTargetSprintChange
}: {
  open: boolean;
  sprint: SprintWithIssues | null;
  plannedSprints: SprintDTO[];
  movePendingTo: "backlog" | "sprint";
  targetSprintId: string;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onMovePendingToChange: (value: "backlog" | "sprint") => void;
  onTargetSprintChange: (value: string) => void;
}) {
  const pendingIssues =
    sprint?.issues.filter((issue) => issue.status !== "DONE") ?? [];
  const doneIssues = sprint?.issues.filter((issue) => issue.status === "DONE") ?? [];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogClose onClose={onClose} />
        <DialogHeader>
          <DialogTitle>Completar sprint</DialogTitle>
          <DialogDescription>
            Las tareas finalizadas permanecen en el sprint completado. Elige dónde
            mover los pendientes.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{sprint?.name}</p>
            <p className="mt-1 text-muted-foreground">
              {doneIssues.length} terminados · {pendingIssues.length} pendientes
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Mover pendientes</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                checked={movePendingTo === "backlog"}
                className="mt-1"
                name="move-pending"
                onChange={() => onMovePendingToChange("backlog")}
                type="radio"
              />
              <span>
                <span className="block text-sm font-medium">
                  Mover pendientes al backlog
                </span>
                <span className="block text-xs text-muted-foreground">
                  Las tareas pendientes quedarán sin sprint.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                checked={movePendingTo === "sprint"}
                className="mt-1"
                name="move-pending"
                onChange={() => onMovePendingToChange("sprint")}
                type="radio"
              />
              <span className="flex-1 space-y-2">
                <span className="block text-sm font-medium">
                  Mover pendientes a otro sprint
                </span>
                <span className="block text-xs text-muted-foreground">
                  Solo se permiten sprints planificados.
                </span>
                {movePendingTo === "sprint" ? (
                  <Select
                    aria-label="Sprint destino para pendientes"
                    value={targetSprintId}
                    onChange={(event) => onTargetSprintChange(event.target.value)}
                  >
                    <option value="">Selecciona sprint destino</option>
                    {plannedSprints.map((plannedSprint) => (
                      <option key={plannedSprint.id} value={plannedSprint.id}>
                        {plannedSprint.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </span>
            </label>
          </fieldset>

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              disabled={isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Completar sprint
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
