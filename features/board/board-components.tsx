"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  CalendarDays,
  GripVertical,
  Loader2,
  Plus,
  Timer,
  UserRound
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatJiraEstimate } from "@/lib/time-estimate";
import type { IssueDTO, IssueStatus } from "@/lib/types";
import { formatDate, initials } from "@/lib/utils";

export const columns: Array<{ status: IssueStatus; title: string }> = [
  { status: "TODO", title: "Por hacer" },
  { status: "IN_PROGRESS", title: "En curso" },
  { status: "DONE", title: "Finalizada" }
];

const WIP_LIMITS: Record<IssueStatus, number | null> = {
  TODO: null,
  IN_PROGRESS: 6,
  DONE: null
};

export type GroupMode = "none" | "epic";

const columnStyles: Record<
  IssueStatus,
  { container: string; dot: string; count: string; cardAccent: string }
> = {
  TODO: {
    container: "border-zinc-200 bg-zinc-50/70",
    dot: "bg-zinc-400",
    count: "border-zinc-200 bg-zinc-100 text-zinc-700",
    cardAccent: "border-l-zinc-300"
  },
  IN_PROGRESS: {
    container: "border-yellow-200 bg-yellow-50/60",
    dot: "bg-yellow-500",
    count: "border-yellow-200 bg-yellow-100 text-yellow-800",
    cardAccent: "border-l-yellow-300"
  },
  DONE: {
    container: "border-emerald-200 bg-emerald-50/60",
    dot: "bg-emerald-500",
    count: "border-emerald-200 bg-emerald-100 text-emerald-700",
    cardAccent: "border-l-emerald-300"
  }
};

export function BoardColumn({
  title,
  status,
  issues,
  groupMode,
  onOpenIssue,
  quickCreate
}: {
  title: string;
  status: IssueStatus;
  issues: IssueDTO[];
  groupMode: GroupMode;
  onOpenIssue: (issue: IssueDTO) => void;
  quickCreate?: {
    title: string;
    error: string | null;
    isPending: boolean;
    onTitleChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  };
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${status}`,
    data: {
      type: "column",
      status
    }
  });
  const groups = groupIssues(issues, groupMode);
  const styles = columnStyles[status];
  const headingId = `board-column-${status.toLowerCase()}`;
  const wipLimit = WIP_LIMITS[status];
  const count = issues.length;
  const wipOver = wipLimit !== null && count >= wipLimit;
  const wipNear = wipLimit !== null && !wipOver && count >= Math.ceil(wipLimit * 0.8);

  return (
    <section
      aria-labelledby={headingId}
      className={`min-h-[520px] rounded-md border p-3 transition-colors ${styles.container} ${
        isOver ? "border-primary bg-accent/60" : ""
      } ${wipOver ? "border-status-blocked/40" : ""}`}
      ref={setNodeRef}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`size-2.5 rounded-full ${styles.dot}`} />
          <h2 className="truncate font-semibold" id={headingId}>
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {wipLimit !== null ? (
            <span
              className={`text-xs font-mono tabular-nums ${
                wipOver
                  ? "font-semibold text-status-blocked"
                  : wipNear
                    ? "text-accent-data"
                    : "text-muted-foreground"
              }`}
              title={`WIP limit: ${wipLimit}`}
            >
              {count}/{wipLimit}
            </span>
          ) : null}
          <Badge className={styles.count} variant="outline">
            {count}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        {quickCreate ? (
          <form
            className="space-y-2 rounded-md border bg-background p-2"
            onSubmit={quickCreate.onSubmit}
          >
            <Input
              aria-label="Crear tarea rápida"
              placeholder="Crear tarea rápida"
              value={quickCreate.title}
              onChange={(event) => quickCreate.onTitleChange(event.target.value)}
            />
            <Button
              className="w-full"
              disabled={quickCreate.isPending}
              size="sm"
              type="submit"
            >
              {quickCreate.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              Crear tarea
            </Button>
            {quickCreate.error ? (
              <p className="text-xs text-destructive" role="alert">
                {quickCreate.error}
              </p>
            ) : null}
          </form>
        ) : null}

        {groups.map((group) => (
          <div className="space-y-2" key={group.label}>
            {groupMode !== "none" ? (
              <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            {group.issues.map((issue) => (
              <IssueCard
                issue={issue}
                key={issue.id}
                onOpen={() => onOpenIssue(issue)}
              />
            ))}
          </div>
        ))}

        {!issues.length ? (
          <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-current/20 bg-background/70 p-4 text-center text-sm">
            <div>
              <p className="font-medium text-foreground">Sin tareas.</p>
              <p className="mt-1 text-muted-foreground">
                Arrastra una tarjeta aquí para cambiar su estado.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function IssueCard({
  issue,
  onOpen
}: {
  issue: IssueDTO;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: `drag:${issue.id}`,
    data: { issue }
  });
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    id: `issue:${issue.id}`,
    data: {
      type: "issue",
      issueId: issue.id,
      status: issue.status
    }
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
      }
    : undefined;

  function setNodeRef(node: HTMLDivElement | null) {
    setDraggableNodeRef(node);
    setDroppableNodeRef(node);
  }

  return (
    <div
      className={`relative touch-none cursor-pointer rounded-md border border-l-4 bg-background p-3 text-left text-sm shadow-sm transition hover:border-primary/40 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${columnStyles[issue.status].cardAccent} ${
        isDragging ? "z-20 opacity-80" : ""
      }`}
      onClick={onOpen}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Abrir tarea ${issue.code}: ${issue.title}`}
        className="block w-full rounded-sm pr-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        type="button"
      >
        <div className="mb-3 min-w-0">
          <p className="ticket-code font-mono text-xs font-semibold text-primary">
            {issue.code}
          </p>
          <h3 className="mt-1 line-clamp-2 font-medium leading-5 text-foreground">
            {issue.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {issue.epic ? (
            <Badge
              style={{ borderColor: issue.epic.color, color: issue.epic.color }}
              variant="outline"
            >
              {issue.epic.name}
            </Badge>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" />
            {formatJiraEstimate(issue.estimate) || "Sin estimación"}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" />
            <span className="max-w-28 truncate" title={issue.assignee.name}>
              {issue.assignee.name || initials(issue.assignee.name)}
            </span>
          </span>
          {issue.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatDate(issue.dueDate)}
            </span>
          ) : null}
        </div>
      </button>

      <button
        aria-label={`Mover tarea ${issue.code}. Presiona Espacio para tomarla y usa las flechas para cambiarla de columna.`}
        className="absolute right-1.5 top-2 cursor-grab touch-none rounded-sm p-1 text-muted-foreground/60 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

function groupIssues(issues: IssueDTO[], mode: GroupMode) {
  if (mode === "none") {
    return [{ label: "Todos", issues }];
  }

  const grouped = new Map<string, IssueDTO[]>();

  for (const issue of issues) {
    const label = issue.epic?.name ?? "Sin épica";
    grouped.set(label, [...(grouped.get(label) ?? []), issue]);
  }

  return Array.from(grouped, ([label, groupIssues]) => ({
    label,
    issues: groupIssues
  }));
}
