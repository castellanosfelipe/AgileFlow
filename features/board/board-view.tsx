"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Search
} from "lucide-react";
import Link from "next/link";
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
  BoardColumn,
  columns,
  type GroupMode
} from "@/features/board/board-components";
import { boardCoordinateGetter } from "@/features/board/keyboard-coordinates";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import type {
  BoardDTO,
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

const statusOrder: Record<IssueStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2
};

type SprintActionPayload = {
  id: string;
  action: "complete";
  movePendingTo: "backlog" | "sprint";
  targetSprintId: string | null;
};

function buildBoardUrl(filters: {
  search: string;
  epicId: string;
  label: string;
  assigneeId: string;
}) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.epicId !== "ALL") params.set("epicId", filters.epicId);
  if (filters.label !== "ALL") params.set("label", filters.label);
  if (filters.assigneeId !== "ALL") {
    params.set("assigneeId", filters.assigneeId);
  }
  const query = params.toString();
  return `/api/board${query ? `?${query}` : ""}`;
}

function sortIssuesForBoard(issues: IssueDTO[]) {
  return [...issues].sort((a, b) => {
    const statusDelta = statusOrder[a.status] - statusOrder[b.status];
    if (statusDelta !== 0) return statusDelta;
    return a.position - b.position;
  });
}

function getTargetIndex({
  issues,
  activeIssueId,
  targetStatus,
  overIssueId
}: {
  issues: IssueDTO[];
  activeIssueId: string;
  targetStatus: IssueStatus;
  overIssueId: string | null;
}) {
  const targetIssues = sortIssuesForBoard(
    issues.filter(
      (issue) => issue.id !== activeIssueId && issue.status === targetStatus
    )
  );

  if (!overIssueId) return targetIssues.length;

  const overIndex = targetIssues.findIndex((issue) => issue.id === overIssueId);
  return overIndex === -1 ? targetIssues.length : overIndex;
}

function calculatePosition({
  issues,
  activeIssueId,
  targetStatus,
  targetIndex
}: {
  issues: IssueDTO[];
  activeIssueId: string;
  targetStatus: IssueStatus;
  targetIndex: number;
}) {
  const targetIssues = sortIssuesForBoard(
    issues.filter(
      (issue) => issue.id !== activeIssueId && issue.status === targetStatus
    )
  );
  const before = targetIssues[targetIndex - 1];
  const after = targetIssues[targetIndex];

  if (before && after) {
    const gap = after.position - before.position;
    return gap > 1 ? Math.floor(before.position + gap / 2) : before.position + 1;
  }

  if (before) return before.position + 1000;
  // Dropping above the first card: place it between 0 and that card. Subtracting
  // a fixed gap could go negative (the server rejects position < 0), so halve.
  if (after) return Math.max(0, Math.floor(after.position / 2));
  return 1000;
}

function optimisticMoveIssue(
  board: BoardDTO,
  move: { issueId: string; status: IssueStatus; position: number }
): BoardDTO {
  if (!board.sprint) return board;

  const issues = board.sprint.issues.map((issue) =>
    issue.id === move.issueId
      ? {
          ...issue,
          status: move.status,
          position: move.position
        }
      : issue
  );

  return {
    ...board,
    sprint: {
      ...board.sprint,
      issues: sortIssuesForBoard(issues)
    }
  };
}

export function BoardView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardCoordinateGetter
    })
  );
  const [search, setSearch] = React.useState("");
  const [epicId, setEpicId] = React.useState("ALL");
  const [label, setLabel] = React.useState("ALL");
  const [assigneeId, setAssigneeId] = React.useState("ALL");
  const [groupMode, setGroupMode] = React.useState<GroupMode>("none");
  const [quickTitle, setQuickTitle] = React.useState("");
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(
    null
  );
  const [boardAnnouncement, setBoardAnnouncement] = React.useState("");
  const [boardMessage, setBoardMessage] = React.useState("");
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
  const [completeMovePendingTo, setCompleteMovePendingTo] =
    React.useState<"backlog" | "sprint">("backlog");
  const [completeTargetSprintId, setCompleteTargetSprintId] =
    React.useState("");
  const [completeError, setCompleteError] = React.useState<string | null>(null);

  const boardQueryKey = React.useMemo(
    () => ["board", search, epicId, label, assigneeId] as const,
    [assigneeId, epicId, label, search]
  );

  const boardQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () =>
      apiFetch<BoardDTO>(
        buildBoardUrl({
          search,
          epicId,
          label,
          assigneeId
        })
      )
  });

  const data = boardQuery.data;
  const currentUser = data?.currentUser ?? null;
  const canManageProject = currentUser?.role === "admin";
  const sprint = data?.sprint ?? null;
  const selectedEpic = (data?.epics ?? []).find((epic) => epic.id === epicId);
  const selectedAssignee = (data?.users ?? []).find(
    (user) => user.id === assigneeId
  );
  const activeFilters = [
    search.trim() ? `Texto: ${search.trim()}` : null,
    epicId !== "ALL" ? `Epica: ${selectedEpic?.name ?? "seleccionada"}` : null,
    label !== "ALL" ? `Etiqueta: ${label}` : null,
    assigneeId !== "ALL"
      ? `Responsable: ${selectedAssignee?.name ?? "seleccionado"}`
      : null,
    groupMode !== "none" ? "Agrupado por epica" : null
  ].filter((filter): filter is string => Boolean(filter));
  const detailSprintOptions = React.useMemo(() => {
    const options = new Map<string, SprintDTO>();
    if (sprint) options.set(sprint.id, sprint);
    for (const plannedSprint of data?.plannedSprints ?? []) {
      options.set(plannedSprint.id, plannedSprint);
    }
    return Array.from(options.values());
  }, [data?.plannedSprints, sprint]);

  React.useEffect(() => {
    if (!boardMessage) return;
    const timeoutId = window.setTimeout(() => setBoardMessage(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [boardMessage]);

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

  const invalidateBoard = () => {
    queryClient.invalidateQueries({ queryKey: ["board"] });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  };

  const createIssue = useMutation({
    mutationFn: () =>
      apiFetch<IssueDTO>("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          title: quickTitle,
          sprintId: sprint?.id,
          status: "TODO",
          type: "TASK",
          priority: "MEDIUM"
        })
      }),
    onSuccess: (createdIssue) => {
      setQuickTitle("");
      setBoardMessage("Tarea creada correctamente.");
      setIssueDetailUrl(createdIssue.id);
      invalidateBoard();
    }
  });

  const completeSprint = useMutation({
    mutationFn: (payload: SprintActionPayload) =>
      apiFetch<SprintDTO>(`/api/sprints/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "complete",
          movePendingTo: payload.movePendingTo,
          targetSprintId: payload.targetSprintId
        })
      }),
    onSuccess: () => {
      setIsCompleteModalOpen(false);
      setCompleteError(null);
      setBoardMessage("Sprint completado correctamente.");
      invalidateBoard();
    },
    onError: (error) => {
      setCompleteError(error.message || "No se pudo completar el sprint");
    }
  });

  const moveIssue = useMutation({
    mutationFn: ({
      issueId,
      status,
      position
    }: {
      issueId: string;
      status: IssueStatus;
      position: number;
    }) =>
      apiFetch<IssueDTO>(`/api/issues/${issueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          position
        })
      }),
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previousBoard = queryClient.getQueryData<BoardDTO>(boardQueryKey);

      queryClient.setQueryData<BoardDTO>(boardQueryKey, (current) => {
        if (!current?.sprint) return current;
        return optimisticMoveIssue(current, move);
      });

      return { previousBoard };
    },
    onError: (_error, _move, context) => {
      setBoardAnnouncement("No se pudo actualizar el estado de la tarea.");
      if (context?.previousBoard) {
        queryClient.setQueryData(boardQueryKey, context.previousBoard);
      }
    },
    onSuccess: () => {
      setBoardAnnouncement("Estado de la tarea actualizado.");
    },
    onSettled: () => {
      invalidateBoard();
    }
  });

  function onQuickCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTitle.trim() || !sprint) return;
    createIssue.mutate();
  }

  function clearFilters() {
    setSearch("");
    setEpicId("ALL");
    setLabel("ALL");
    setAssigneeId("ALL");
    setGroupMode("none");
    setBoardMessage("Filtros limpiados.");
  }

  function onCompleteSprint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sprint) return;
    if (completeMovePendingTo === "sprint" && !completeTargetSprintId) {
      setCompleteError("Selecciona un sprint planificado para los pendientes");
      return;
    }

    completeSprint.mutate({
      id: sprint.id,
      action: "complete",
      movePendingTo: completeMovePendingTo,
      targetSprintId:
        completeMovePendingTo === "sprint" ? completeTargetSprintId : null
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const activeIssue = event.active.data.current?.issue as IssueDTO | undefined;
    const overData = event.over?.data.current as
      | { type: "column"; status: IssueStatus }
      | { type: "issue"; issueId: string; status: IssueStatus }
      | undefined;

    if (!activeIssue || !overData || !sprint) return;

    if (
      currentUser?.role !== "admin" &&
      activeIssue.assigneeId !== currentUser?.id
    ) {
      setBoardAnnouncement(
        "Solo puedes mover tareas que esten asignadas a ti."
      );
      return;
    }

    if (overData.type === "issue" && overData.issueId === activeIssue.id) {
      return;
    }

    const targetStatus = overData.status;
    const targetIndex = getTargetIndex({
      issues: sprint.issues,
      activeIssueId: activeIssue.id,
      targetStatus,
      overIssueId: overData.type === "issue" ? overData.issueId : null
    });
    const position = calculatePosition({
      issues: sprint.issues,
      activeIssueId: activeIssue.id,
      targetStatus,
      targetIndex
    });

    if (activeIssue.status === targetStatus && activeIssue.position === position) {
      return;
    }

    moveIssue.mutate({
      issueId: activeIssue.id,
      status: targetStatus,
      position
    });
  }

  if (boardQuery.isLoading) {
    return (
      <div
        aria-live="polite"
        className="rounded-md border p-6 text-sm text-muted-foreground"
        role="status"
      >
        Cargando tablero...
      </div>
    );
  }

  if (!sprint) {
    return (
      <section className="space-y-4">
        <div className="rounded-md border bg-background p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-normal">Kanban</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No hay sprint activo. Inicia un sprint desde Backlog para ver sus
            tareas en el tablero.
          </p>
          <Button asChild className="mt-4">
            <Link href="/backlog">Ir al Backlog</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Kanban</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
              {sprint.name}
            </Badge>
            {data?.project ? (
              <span>
                {data.project.key} · {data.project.name}
              </span>
            ) : null}
            <span>
              {formatDate(sprint.startsAt)} - {formatDate(sprint.endsAt)}
            </span>
          </div>
        </div>

        {canManageProject ? (
          <Button
            onClick={() => {
              setCompleteError(null);
              setCompleteMovePendingTo("backlog");
              setCompleteTargetSprintId("");
              setIsCompleteModalOpen(true);
            }}
            type="button"
            variant="secondary"
          >
            <CheckCircle2 />
            Completar sprint
          </Button>
        ) : null}
      </div>

      {canManageProject ? (
        <CompleteSprintDialog
          error={completeError}
          isPending={completeSprint.isPending}
          movePendingTo={completeMovePendingTo}
          onClose={() => {
            if (!completeSprint.isPending) setIsCompleteModalOpen(false);
          }}
          onMovePendingToChange={setCompleteMovePendingTo}
          onSubmit={onCompleteSprint}
          onTargetSprintChange={setCompleteTargetSprintId}
          open={isCompleteModalOpen}
          plannedSprints={data?.plannedSprints ?? []}
          sprint={sprint}
          targetSprintId={completeTargetSprintId}
        />
      ) : null}

      <IssueDetailDialog
        currentUser={currentUser}
        epics={data?.epics ?? []}
        issueId={selectedIssueId}
        onChanged={invalidateBoard}
        onClose={() => setIssueDetailUrl(null)}
        onOpenIssue={setIssueDetailUrl}
        sprints={detailSprintOptions}
        users={data?.users ?? []}
      />

      <p aria-live="polite" className="sr-only" role="status">
        {boardAnnouncement}
      </p>

      {boardMessage ? (
        <div
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {boardMessage}
        </div>
      ) : null}

      <Card className="bg-muted/20 shadow-none">
        <CardContent className="grid gap-2 p-3 xl:grid-cols-[minmax(220px,1fr)_180px_170px_190px_180px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar tareas"
              className="pl-9"
              placeholder="Buscar por texto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <Select
            aria-label="Filtrar por épica"
            value={epicId}
            onChange={(event) => setEpicId(event.target.value)}
          >
            <option value="ALL">Todas las épicas</option>
            {(data?.epics ?? []).map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filtrar por etiqueta"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          >
            <option value="ALL">Todas las etiquetas</option>
            {(data?.labels ?? []).map((issueLabel) => (
              <option key={issueLabel.name} value={issueLabel.name}>
                {issueLabel.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filtrar por responsable"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="ALL">Todos los responsables</option>
            {(data?.users ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Agrupar tarjetas"
            value={groupMode}
            onChange={(event) => setGroupMode(event.target.value as GroupMode)}
          >
            <option value="none">Sin agrupación</option>
            <option value="epic">Agrupar por épica</option>
          </Select>

          <Button
            disabled={!activeFilters.length}
            onClick={clearFilters}
            type="button"
            variant="outline"
          >
            Limpiar
          </Button>

          <div className="flex flex-wrap gap-2 xl:col-span-6">
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

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((column) => {
            const issues = sprint.issues.filter(
              (issue) => issue.status === column.status
            );
            return (
              <BoardColumn
                groupMode={groupMode}
                issues={issues}
                key={column.status}
                onOpenIssue={(issue) => setIssueDetailUrl(issue.id)}
                quickCreate={
                  column.status === "TODO"
                    ? {
                        title: quickTitle,
                        error: createIssue.error?.message ?? null,
                        isPending: createIssue.isPending,
                        onTitleChange: setQuickTitle,
                        onSubmit: onQuickCreate
                      }
                    : undefined
                }
                status={column.status}
                title={column.title}
              />
            );
          })}
        </div>
      </DndContext>
    </div>
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
  sprint: SprintDTO & { issues: IssueDTO[] };
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
  const pendingIssues = sprint.issues.filter((issue) => issue.status !== "DONE");
  const doneIssues = sprint.issues.filter((issue) => issue.status === "DONE");

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
            <p className="font-medium">{sprint.name}</p>
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
                name="board-move-pending"
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
                name="board-move-pending"
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
