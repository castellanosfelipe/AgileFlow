"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Loader2,
  Play,
  Plus
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SortableGridHeader,
  compareSortableValues,
  type SortableValue,
  type SortState
} from "@/components/sortable-grid-header";
import type { IssueDTO, IssueStatus, SprintDTO, SprintStatus } from "@/lib/types";
import { formatDate, initials } from "@/lib/utils";

export type SprintWithIssues = SprintDTO & { issues: IssueDTO[] };

const sprintStatusLabel: Record<SprintStatus, string> = {
  PLANNED: "Planificado",
  ACTIVE: "Activo",
  COMPLETED: "Completado"
};

const sprintStatusClass: Record<SprintStatus, string> = {
  PLANNED: "border-amber-200 bg-amber-50 text-amber-800",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-zinc-200 bg-zinc-100 text-zinc-600"
};

const issueStatusLabel: Record<IssueStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  DONE: "Finalizada"
};

const issueStatusClass: Record<IssueStatus, string> = {
  TODO: "border-zinc-200 bg-zinc-100 text-zinc-700",
  IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-800",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

type IssueTreeRow = {
  issue: IssueDTO;
  level: number;
  hasChildren: boolean;
};

type IssueListSortKey = "code" | "title" | "epic" | "status" | "assignee";

function getIssueListSortValue(
  issue: IssueDTO,
  key: IssueListSortKey
): SortableValue {
  if (key === "code") return issue.code;
  if (key === "title") return issue.title;
  if (key === "epic") return issue.epic?.name ?? "Sin epica";
  if (key === "status") return issueStatusLabel[issue.status];
  return issue.assignee.name;
}

function sortIssueSiblings(
  issues: IssueDTO[],
  sortState: SortState<IssueListSortKey>
) {
  return [...issues].sort((first, second) => {
    const result = compareSortableValues(
      getIssueListSortValue(first, sortState.key),
      getIssueListSortValue(second, sortState.key)
    );

    return sortState.direction === "asc" ? result : -result;
  });
}

function buildIssueTreeRows(
  issues: IssueDTO[],
  collapsedIssueIds: Set<string>,
  sortState: SortState<IssueListSortKey>
): IssueTreeRow[] {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const childrenByParent = new Map<string, IssueDTO[]>();
  const roots: IssueDTO[] = [];

  for (const issue of issues) {
    if (issue.parentIssueId && issueById.has(issue.parentIssueId)) {
      const children = childrenByParent.get(issue.parentIssueId) ?? [];
      children.push(issue);
      childrenByParent.set(issue.parentIssueId, children);
    } else {
      roots.push(issue);
    }
  }

  const rows: IssueTreeRow[] = [];
  const addIssue = (issue: IssueDTO, level: number) => {
    const children = sortIssueSiblings(
      childrenByParent.get(issue.id) ?? [],
      sortState
    );
    rows.push({
      issue,
      level,
      hasChildren: children.length > 0
    });
    if (!collapsedIssueIds.has(issue.id)) {
      for (const child of children) addIssue(child, level + 1);
    }
  };

  for (const issue of sortIssueSiblings(roots, sortState)) addIssue(issue, 0);

  return rows;
}

export function SprintSection({
  sprint,
  expanded,
  canManageProject,
  isMutating,
  onToggle,
  onStart,
  onComplete,
  onOpenIssue
}: {
  sprint: SprintWithIssues;
  expanded: boolean;
  canManageProject: boolean;
  isMutating: boolean;
  onToggle: () => void;
  onStart: () => void;
  onComplete: () => void;
  onOpenIssue: (issueId: string) => void;
}) {
  const canStart = sprint.status === "PLANNED";
  const canComplete = sprint.status === "ACTIVE";

  return (
    <section className="overflow-hidden rounded-md border bg-background shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
        <button
          aria-controls={`sprint-content-${sprint.id}`}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{sprint.name}</h2>
              <Badge className={sprintStatusClass[sprint.status]} variant="outline">
                {sprintStatusLabel[sprint.status]}
              </Badge>
              <Badge variant="muted">{sprint.issues.length} actividades</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {formatDate(sprint.startsAt)} - {formatDate(sprint.endsAt)}
            </p>
          </div>
        </button>

        {canManageProject && sprint.status === "PLANNED" ? (
          <Button
            disabled={!canStart || isMutating}
            onClick={onStart}
            size="sm"
            type="button"
            variant="outline"
          >
            <Play />
            Iniciar sprint
          </Button>
        ) : null}

        {canManageProject && canComplete ? (
          <Button
            disabled={isMutating}
            onClick={onComplete}
            size="sm"
            type="button"
            variant="secondary"
          >
            <CheckCircle2 />
            Completar sprint
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div id={`sprint-content-${sprint.id}`}>
          <IssueList
            issues={sprint.issues}
            onOpenIssue={onOpenIssue}
            showStatus
          />
        </div>
      ) : null}
    </section>
  );
}

export function BacklogSection({
  issues,
  expanded,
  error,
  isCreating,
  issueTitle,
  setIssueTitle,
  onToggle,
  onCreateIssue,
  onOpenIssue
}: {
  issues: IssueDTO[];
  expanded: boolean;
  error: string | null;
  isCreating: boolean;
  issueTitle: string;
  setIssueTitle: (value: string) => void;
  onToggle: () => void;
  onCreateIssue: (event: React.FormEvent<HTMLFormElement>) => void;
  onOpenIssue: (issueId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/20 p-3">
        <button
          aria-controls="backlog-content"
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left"
          onClick={onToggle}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <div>
            <h2 className="text-sm font-semibold">Backlog</h2>
            <p className="text-xs text-muted-foreground">
              {issues.length} actividades sin sprint
            </p>
          </div>
        </button>
      </div>

      {expanded ? (
        <div id="backlog-content">
          <form
            className="grid gap-2 border-b bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={onCreateIssue}
          >
            <Input
              aria-label="Título de la tarea"
              placeholder="Crear tarea en backlog"
              value={issueTitle}
              onChange={(event) => setIssueTitle(event.target.value)}
            />
            <Button disabled={isCreating} type="submit">
              {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              Crear tarea
            </Button>
          </form>
          {error ? (
            <p
              className="border-b bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <IssueList issues={issues} onOpenIssue={onOpenIssue} />
        </div>
      ) : null}
    </section>
  );
}

function IssueList({
  issues,
  onOpenIssue,
  showStatus = false
}: {
  issues: IssueDTO[];
  onOpenIssue: (issueId: string) => void;
  showStatus?: boolean;
}) {
  const [collapsedIssueIds, setCollapsedIssueIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [sortState, setSortState] = React.useState<SortState<IssueListSortKey>>({
    key: "code",
    direction: "asc"
  });

  function toggleIssue(issueId: string) {
    setCollapsedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }

  if (!issues.length) {
    return (
      <div className="m-3 rounded-md border border-dashed bg-muted/20 p-5 text-sm">
        <p className="font-medium text-foreground">No hay tareas.</p>
        <p className="mt-1 text-muted-foreground">
          Las tareas aparecerán aquí cuando se creen o se muevan a esta sección.
        </p>
      </div>
    );
  }

  const gridClass = showStatus
    ? "sm:grid-cols-[110px_minmax(220px,1fr)_160px_140px_170px]"
    : "sm:grid-cols-[110px_minmax(220px,1fr)_180px_170px]";
  const rows = buildIssueTreeRows(issues, collapsedIssueIds, sortState);

  return (
    <div>
      <div
        className={`hidden gap-3 border-b bg-muted/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground sm:grid ${gridClass}`}
      >
        <SortableGridHeader
          label="ID"
          onSortChange={setSortState}
          sortKey="code"
          sortState={sortState}
        />
        <SortableGridHeader
          label="Titulo"
          onSortChange={setSortState}
          sortKey="title"
          sortState={sortState}
        />
        <SortableGridHeader
          label="Epica"
          onSortChange={setSortState}
          sortKey="epic"
          sortState={sortState}
        />
        {showStatus ? (
          <SortableGridHeader
            label="Estado"
            onSortChange={setSortState}
            sortKey="status"
            sortState={sortState}
          />
        ) : null}
        <SortableGridHeader
          label="Responsable"
          onSortChange={setSortState}
          sortKey="assignee"
          sortState={sortState}
        />
      </div>
      <div className="divide-y">
        {rows.map((row) => (
          <IssueRow
            hasChildren={row.hasChildren}
            issue={row.issue}
            isExpanded={!collapsedIssueIds.has(row.issue.id)}
            key={row.issue.id}
            level={row.level}
            onOpenIssue={onOpenIssue}
            onToggleIssue={toggleIssue}
            showStatus={showStatus}
          />
        ))}
      </div>
    </div>
  );
}

function IssueRow({
  hasChildren,
  issue,
  isExpanded,
  level,
  onOpenIssue,
  onToggleIssue,
  showStatus
}: {
  hasChildren: boolean;
  issue: IssueDTO;
  isExpanded: boolean;
  level: number;
  onOpenIssue: (issueId: string) => void;
  onToggleIssue: (issueId: string) => void;
  showStatus: boolean;
}) {
  const gridClass = showStatus
    ? "sm:grid-cols-[110px_minmax(220px,1fr)_160px_140px_170px]"
    : "sm:grid-cols-[110px_minmax(220px,1fr)_180px_170px]";

  return (
    <div
      aria-label={`Abrir ${issue.code}: ${issue.title}`}
      className={`grid w-full cursor-pointer gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${gridClass}`}
      data-testid={`issue-row-${issue.code}`}
      onClick={() => onOpenIssue(issue.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenIssue(issue.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center">
        <span
          className="inline-flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: level ? `${level * 22}px` : undefined }}
        >
          {level === 0 && hasChildren ? (
            <button
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? `Contraer subtareas de ${issue.code}`
                  : `Expandir subtareas de ${issue.code}`
              }
              className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.stopPropagation();
                onToggleIssue(issue.id);
              }}
              type="button"
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          ) : level > 0 ? (
            <CornerDownRight className="size-4 shrink-0 text-primary/70" />
          ) : (
            <span className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="ticket-code font-mono text-xs font-semibold text-primary">
            {issue.code}
          </span>
        </span>
      </div>
      <div className="min-w-0">
        <p
          className={`truncate ${
            level > 0
              ? "text-muted-foreground"
              : "font-medium text-foreground"
          }`}
        >
          {issue.title}
        </p>
      </div>
      <div className="flex items-center">
        {issue.epic ? (
          <Badge
            className="max-w-full truncate"
            style={{
              borderColor: issue.epic.color,
              color: issue.epic.color
            }}
            variant="outline"
          >
            {issue.epic.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Sin épica</span>
        )}
      </div>
      {showStatus ? (
        <div className="flex items-center">
          <Badge className={issueStatusClass[issue.status]} variant="outline">
            {issueStatusLabel[issue.status]}
          </Badge>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground">
          {initials(issue.assignee.name)}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {issue.assignee.name}
        </span>
      </div>
    </div>
  );
}
