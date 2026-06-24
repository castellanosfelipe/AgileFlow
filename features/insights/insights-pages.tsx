"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Download,
  Info,
  Loader2,
  Network,
  Plus,
  Search,
  Timer,
  Users
} from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SortableGridHeader,
  sortByState,
  type SortableValue,
  type SortState
} from "@/components/sortable-grid-header";
import { apiFetch } from "@/lib/api-client";
import { formatJiraEstimate } from "@/lib/time-estimate";
import type { IssueStatus, SprintDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { PlanningIssueDTO, ProjectInsightsDTO } from "./insights-types";
import {
  buildDailyLoad,
  buildDependencyLinks,
  buildTimelineDays,
  createIssueHelpers,
  filterIssues,
  formatDateLong,
  formatDateShort,
  formatHoursFromMinutes,
  formatMinutes,
  getAgingBuckets,
  getBottlenecks,
  getDayOffset,
  getDurationDays,
  getTimelineBounds,
  groupIssuesByAssignee,
  groupIssuesByPrincipal,
  type IssueGroup,
  type IssueMetrics,
  statusBadgeClasses,
  statusBarClasses,
  statusLabels,
  type InsightFilters
} from "./insights-utils";

const IssueDetailDialog = dynamic(
  () =>
    import("@/features/issues/issue-detail-dialog").then(
      (mod) => mod.IssueDetailDialog
    ),
  { ssr: false }
);

const defaultFilters: InsightFilters = {
  query: "",
  assigneeIds: [],
  status: "ALL",
  sprintIds: [],
  epicIds: [],
  showSubtasks: true
};

type InsightsView = "gantt" | "pert" | "executive";

type DailyTrackingSortKey =
  | "assignee"
  | "code"
  | "title"
  | "status"
  | "startDate"
  | "dueDate"
  | "estimate"
  | "timeSpent"
  | "worklogs";

type MissingEstimateSortKey =
  | "assignee"
  | "total"
  | "missingStartDate"
  | "missingDueDate"
  | "missingEstimate"
  | "missingDailyTracking";

type MissingEstimateDetailSortKey =
  | "code"
  | "title"
  | "status"
  | "startDate"
  | "dueDate"
  | "estimate";

type WorklogSortKey = "description" | "createdAt" | "timeSpent";

type DailySubtaskSortKey =
  | "code"
  | "title"
  | "assignee"
  | "status"
  | "timeSpent"
  | "worklogs";

type AccuracySortKey = "code" | "title" | "ratio";

type ExecutiveDailySortKey =
  | "assignee"
  | "date"
  | "minutes"
  | "utilization"
  | "status"
  | "tickets";

type ExecutiveIssueSortKey =
  | "code"
  | "title"
  | "sprint"
  | "estimate"
  | "remaining";

type AgingSortKey = "code" | "title" | "assignee";

type InsightsPageProps = {
  view: InsightsView;
};

export function InsightsPage({ view }: InsightsPageProps) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<InsightFilters>(defaultFilters);
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(
    null
  );
  const insightsQuery = useQuery({
    queryKey: ["project-insights", view],
    queryFn: () => apiFetch<ProjectInsightsDTO>(`/api/insights/${view}`)
  });

  const data = insightsQuery.data;
  const issues = data?.issues ?? [];
  const helpers = React.useMemo(() => createIssueHelpers(issues), [issues]);
  const visibleIssues = React.useMemo(
    () => filterIssues(issues, helpers, filters),
    [issues, helpers, filters]
  );

  const title =
    view === "gantt"
      ? "Gantt"
      : view === "pert"
        ? "PERT"
        : "Tablero ejecutivo";
  const subtitle =
    view === "gantt"
      ? "Linea de tiempo por responsable con tareas y subtareas del proyecto actual."
      : view === "pert"
        ? "Mapa de dependencias construido con el campo Bloqueada por."
        : "Indicadores de avance, carga y salud de planeacion del proyecto actual.";

  function refreshInsights() {
    queryClient.invalidateQueries({ queryKey: ["project-insights"] });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
    queryClient.invalidateQueries({ queryKey: ["board"] });
  }

  if (insightsQuery.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Cargando datos del proyecto...
      </div>
    );
  }

  if (!data?.project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay proyecto configurado</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Crea o carga un proyecto para consultar estas vistas.
        </CardContent>
      </Card>
    );
  }

  if (view === "executive") {
    return (
      <div className="space-y-5">
        <InsightsFilters
          data={data}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <ExecutiveView
          helpers={helpers}
          issues={visibleIssues}
          onOpenIssue={setSelectedIssueId}
        />
        <IssueDetailDialog
          currentUser={data.currentUser}
          epics={data.epics}
          issueId={selectedIssueId}
          onChanged={refreshInsights}
          onClose={() => setSelectedIssueId(null)}
          onOpenIssue={setSelectedIssueId}
          sprints={data.sprints}
          users={data.users}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {data.project.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{visibleIssues.length} tareas visibles</Badge>
          <Button
            disabled={insightsQuery.isFetching}
            onClick={refreshInsights}
            size="sm"
            type="button"
            variant="outline"
          >
            {insightsQuery.isFetching ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Activity />
            )}
            Actualizar
          </Button>
        </div>
      </section>

      <InsightsFilters
        data={data}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {view === "gantt" ? (
        <GanttView
          helpers={helpers}
          issues={visibleIssues}
          onOpenIssue={setSelectedIssueId}
          selectedSprintIds={filters.sprintIds}
          sprints={data.sprints}
        />
      ) : null}

      {view === "pert" ? (
        <PertView
          helpers={helpers}
          issues={visibleIssues}
          onOpenIssue={setSelectedIssueId}
        />
      ) : null}

      <IssueDetailDialog
        currentUser={data.currentUser}
        epics={data.epics}
        issueId={selectedIssueId}
        onChanged={refreshInsights}
        onClose={() => setSelectedIssueId(null)}
        onOpenIssue={setSelectedIssueId}
        sprints={data.sprints}
        users={data.users}
      />
    </div>
  );
}

function InsightsFilters({
  data,
  filters,
  onFiltersChange
}: {
  data: ProjectInsightsDTO;
  filters: InsightFilters;
  onFiltersChange: React.Dispatch<React.SetStateAction<InsightFilters>>;
}) {
  const sprintFilterOptions = React.useMemo(
    () =>
      data.sprints.filter(
        (sprint) => sprint.status === "ACTIVE" || sprint.status === "PLANNED"
      ),
    [data.sprints]
  );

  React.useEffect(() => {
    const validSprintIds = new Set([
      "BACKLOG",
      ...sprintFilterOptions.map((sprint) => sprint.id)
    ]);
    const nextSprintIds = filters.sprintIds.filter((sprintId) =>
      validSprintIds.has(sprintId)
    );

    if (nextSprintIds.length !== filters.sprintIds.length) {
      onFiltersChange((current) => ({
        ...current,
        sprintIds: current.sprintIds.filter((sprintId) =>
          validSprintIds.has(sprintId)
        )
      }));
    }
  }, [filters.sprintIds, onFiltersChange, sprintFilterOptions]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))_auto]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Busqueda
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) =>
                  onFiltersChange((current) => ({
                    ...current,
                    query: event.target.value
                  }))
                }
                placeholder="Buscar por id, titulo, responsable o epica"
                value={filters.query}
              />
            </div>
          </label>

          <MultiFilterSelect
            label="Responsable"
            onChange={(values) =>
              onFiltersChange((current) => ({
                ...current,
                assigneeIds: values
              }))
            }
            options={data.users.map((user) => ({
              label: user.name,
              value: user.id
            }))}
            values={filters.assigneeIds}
          />

          <MultiFilterSelect
            label="Sprint"
            onChange={(values) =>
              onFiltersChange((current) => ({
                ...current,
                sprintIds: values
              }))
            }
            options={[
              { label: "Backlog", value: "BACKLOG" },
              ...sprintFilterOptions.map((sprint) => ({
                label: sprint.name,
                value: sprint.id
              }))
            ]}
            values={filters.sprintIds}
          />

          <MultiFilterSelect
            label="Epica"
            onChange={(values) =>
              onFiltersChange((current) => ({
                ...current,
                epicIds: values
              }))
            }
            options={data.epics.map((epic) => ({
              label: epic.name,
              value: epic.id
            }))}
            values={filters.epicIds}
          />

          <div className="flex items-end gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input
                checked={filters.showSubtasks}
                className="size-4 accent-primary"
                onChange={(event) =>
                  onFiltersChange((current) => ({
                    ...current,
                    showSubtasks: event.target.checked
                  }))
                }
                type="checkbox"
              />
              Subtareas
            </label>
            <Button
              onClick={() => onFiltersChange(defaultFilters)}
              type="button"
              variant="outline"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type MultiFilterOption = {
  label: string;
  value: string;
};

function MultiFilterSelect({
  allLabel = "Todos",
  label,
  onChange,
  options,
  values
}: {
  allLabel?: string;
  label: string;
  onChange: (values: string[]) => void;
  options: MultiFilterOption[];
  values: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const labelId = React.useId();
  const selectedOptions = options.filter((option) => values.includes(option.value));
  const summary =
    selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} seleccionados`;

  React.useEffect(() => {
    if (!open) return;

    function onDocumentMouseDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  function toggleValue(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((currentValue) => currentValue !== value)
        : [...values, value]
    );
  }

  return (
    <div className="relative space-y-1.5" ref={wrapperRef}>
      <span className="text-xs font-medium text-muted-foreground" id={labelId}>
        {label}
      </span>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-labelledby={labelId}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div
          className="absolute z-[100] mt-1 w-full min-w-[220px] overflow-hidden rounded-md border border-border bg-card p-2 text-card-foreground shadow-xl ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          role="menu"
        >
          <p className="px-2 pb-2 text-[11px] text-muted-foreground">
            OR: muestra tareas que coincidan con cualquiera de las opciones.
          </p>
          <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
            <input
              checked={values.length === 0}
              className="size-4 accent-primary"
              onChange={() => onChange([])}
              type="checkbox"
            />
            <span className="min-w-0 truncate">{allLabel}</span>
          </label>
          <div className="max-h-60 overflow-auto">
            {options.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                key={option.value}
              >
                <input
                  checked={values.includes(option.value)}
                  className="size-4 accent-primary"
                  onChange={() => toggleValue(option.value)}
                  type="checkbox"
                />
                <span className="min-w-0 truncate" title={option.label}>
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GanttView({
  helpers,
  issues,
  onOpenIssue,
  selectedSprintIds,
  sprints
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  issues: PlanningIssueDTO[];
  onOpenIssue: (issueId: string) => void;
  selectedSprintIds: string[];
  sprints: SprintDTO[];
}) {
  const [zoom, setZoom] = React.useState<GanttZoom>("week");
  const [groupMode, setGroupMode] = React.useState<GanttGroupMode>("assignee");
  const [hideDone, setHideDone] = React.useState(false);
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [expandedTimeRows, setExpandedTimeRows] = React.useState<Set<string>>(
    () => new Set()
  );
  const [expandedMissingGroups, setExpandedMissingGroups] = React.useState<
    Set<string>
  >(() => new Set());
  const [dailyTrackingSort, setDailyTrackingSort] = React.useState<
    SortState<DailyTrackingSortKey>
  >({ key: "assignee", direction: "asc" });
  const [missingEstimateSort, setMissingEstimateSort] = React.useState<
    SortState<MissingEstimateSortKey>
  >({ key: "total", direction: "desc" });
  const pxPerDay = zoomConfig[zoom].pxPerDay;
  const leftColumnWidth = 380;
  const rowHeight = 58;
  const timelineHeaderHeight = 44;
  const sprintBarHeight = 24;
  const selectedSprintRanges = React.useMemo(
    () =>
      selectedSprintIds
        .filter((sprintId) => sprintId !== "BACKLOG")
        .map((sprintId) => sprints.find((sprint) => sprint.id === sprintId))
        .filter((sprint): sprint is SprintDTO => Boolean(sprint?.startsAt && sprint.endsAt))
        .map((sprint) => {
          const start = new Date(sprint.startsAt!);
          const end = new Date(sprint.endsAt!);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return null;
          }

          return {
            id: sprint.id,
            name: sprint.name,
            start: stripTimeLocal(start),
            end: stripTimeLocal(end)
          };
        })
        .filter((sprint): sprint is { id: string; name: string; start: Date; end: Date } =>
          Boolean(sprint)
        ),
    [selectedSprintIds, sprints]
  );

  const normalizedIssues = React.useMemo(
    () =>
      issues.filter((issue) => {
        const metrics = helpers.getMetrics(issue);
        if (hideDone && issue.status === "DONE") return false;
        if (overdueOnly && !metrics.isOverdue) return false;
        return true;
      }),
    [helpers, hideDone, issues, overdueOnly]
  );
  const timeline = React.useMemo(() => {
    const bounds = getTimelineBounds(normalizedIssues, helpers);
    let start = bounds.start;
    let end = bounds.end;

    for (const sprint of selectedSprintRanges) {
      if (sprint.start < start) start = addDaysLocal(sprint.start, -2);
      if (sprint.end > end) end = addDaysLocal(sprint.end, 2);
    }

    const totalDays = getDurationDays(start, end);
    return {
      start,
      end,
      totalDays,
      width: Math.max(totalDays * pxPerDay, 760),
      units: buildTimelineUnits(start, end, zoom, pxPerDay)
    };
  }, [helpers, normalizedIssues, pxPerDay, selectedSprintRanges, zoom]);
  const selectedSprintBars = React.useMemo(
    () =>
      selectedSprintRanges
        .map((sprint) => {
          const clippedStart = sprint.start < timeline.start ? timeline.start : sprint.start;
          const clippedEnd = sprint.end > timeline.end ? timeline.end : sprint.end;
          if (clippedEnd < timeline.start || clippedStart > timeline.end) return null;

          return {
            ...sprint,
            left: getDayOffset(clippedStart, timeline.start) * pxPerDay,
            width: Math.max(
              getDurationDays(clippedStart, clippedEnd) * pxPerDay,
              80
            )
          };
        })
        .filter(
          (sprint): sprint is {
            id: string;
            name: string;
            start: Date;
            end: Date;
            left: number;
            width: number;
          } => Boolean(sprint)
        ),
    [pxPerDay, selectedSprintRanges, timeline.end, timeline.start]
  );
  const stickyHeaderHeight =
    timelineHeaderHeight + selectedSprintBars.length * sprintBarHeight;
  const dateStats = React.useMemo(
    () => getGanttDateStats(normalizedIssues, helpers),
    [helpers, normalizedIssues]
  );
  const groupedIssues = React.useMemo(() => {
    if (groupMode === "principal") {
      return groupIssuesByPrincipal(normalizedIssues, helpers);
    }

    return groupIssuesByAssignee(normalizedIssues);
  }, [groupMode, helpers, normalizedIssues]);
  const rows = React.useMemo(() => buildGanttRows(groupedIssues), [groupedIssues]);
  const issueRowIndex = React.useMemo(() => {
    const index = new Map<string, number>();
    rows.forEach((row, rowIndex) => {
      if (row.type === "issue") index.set(row.issue.id, rowIndex);
    });
    return index;
  }, [rows]);
  const dependencyLinks = React.useMemo(
    () =>
      buildDependencyLinks(normalizedIssues, "is_blocked_by").filter(
        (link) => issueRowIndex.has(link.from.id) && issueRowIndex.has(link.to.id)
      ),
    [issueRowIndex, normalizedIssues]
  );
  const dailyTrackingRows = React.useMemo(
    () => buildDailyTrackingRows(normalizedIssues, helpers),
    [helpers, normalizedIssues]
  );
  const sortedDailyTrackingRows = React.useMemo(
    () =>
      sortByState(
        dailyTrackingRows,
        dailyTrackingSort,
        getDailyTrackingSortValue
      ),
    [dailyTrackingRows, dailyTrackingSort]
  );
  const missingEstimateGroups = React.useMemo(
    () => buildMissingEstimateGroups(normalizedIssues, helpers),
    [helpers, normalizedIssues]
  );
  const sortedMissingEstimateGroups = React.useMemo(
    () =>
      sortByState(
        missingEstimateGroups,
        missingEstimateSort,
        getMissingEstimateGroupSortValue
      ),
    [missingEstimateGroups, missingEstimateSort]
  );
  const totalEstimate = normalizedIssues.reduce(
    (sum, issue) => sum + helpers.getMetrics(issue).estimate,
    0
  );
  const doneCount = normalizedIssues.filter((issue) => issue.status === "DONE").length;

  if (!normalizedIssues.length && !selectedSprintBars.length) {
    return <EmptyPanel title="Sin tareas visibles" />;
  }

  function exportDailyTracking() {
    downloadCsv("seguimiento-diario.csv", [
      [
        "Usuario asignado",
        "Ticket",
        "Descripcion",
        "Estado",
        "Start day",
        "Fecha de vencimiento",
        "Estimacion original",
        "Usado",
        "Restante",
        "Registros"
      ],
      ...sortedDailyTrackingRows.map((row) => [
        row.issue.assignee.name,
        row.issue.code,
        row.issue.title,
        statusLabels[row.issue.status],
        formatDateLong(row.metrics.startDate),
        formatDateLong(row.metrics.dueDate),
        formatMinutes(row.metrics.estimate),
        formatCompactMinutes(row.metrics.timeSpent),
        formatCompactMinutes(row.metrics.timeRemaining),
        getIssueHierarchyWorklogCount(row.issue, helpers)
      ]),
      ["", "", "", "", "", "", "", "", "", ""],
      [
        "Tipo",
        "Ticket",
        "Ticket padre",
        "Descripcion registro",
        "Fecha y hora registro",
        "Horas registradas",
        "",
        "",
        "",
        ""
      ],
      ...sortedDailyTrackingRows.flatMap((row) =>
        buildDailyTrackingExportRows(row, helpers)
      )
    ]);
  }

  function exportMissingEstimates() {
    downloadCsv("pendientes-por-estimar.csv", [
      [
        "Usuario asignado",
        "Total pendientes",
        "Sin start date",
        "Sin fecha vencimiento",
        "Sin estimacion original",
        "Sin seguimiento diario"
      ],
      ...sortedMissingEstimateGroups.map((group) => [
        group.assigneeName,
        group.totalPending,
        group.missingStartDate,
        group.missingDueDate,
        group.missingEstimate,
        group.missingDailyTracking
      ]),
      ["", "", "", "", "", ""],
      [
        "Usuario asignado",
        "Ticket",
        "Descripcion",
        "Estado",
        "Start day",
        "Fecha de vencimiento",
        "Estimacion original"
      ],
      ...sortedMissingEstimateGroups.flatMap((group) =>
        getRowsMissingOriginalEstimate(group).map((row) => [
          group.assigneeName,
          row.issue.code,
          row.issue.title,
          statusLabels[row.issue.status],
          formatDateLong(row.metrics.startDate),
          formatDateLong(row.metrics.dueDate),
          formatMinutes(row.metrics.estimate)
        ])
      )
    ]);
  }

  function toggleTimeRow(issueId: string) {
    setExpandedTimeRows((current) => {
      const next = new Set(current);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }

  function toggleMissingGroup(groupId: string) {
    setExpandedMissingGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          label="Rango visible"
          value={`${formatDateShort(dateStats.start)} - ${formatDateShort(dateStats.end)}`}
        />
        <MetricCard icon={Users} label="Responsables" value={groupedIssues.length} />
        <MetricCard
          icon={Clock3}
          label="Estimacion"
          value={formatMinutes(totalEstimate)}
          helper={`${dateStats.durationDays} dias de duracion`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Finalizadas"
          value={doneCount}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>
              {groupMode === "assignee"
                ? "Gantt por usuario asignado"
                : "Gantt por principal"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground dark:text-zinc-400">
              Fecha minima global {formatDateLong(dateStats.start)}, fecha
              maxima global {formatDateLong(dateStats.end)} y duracion total de{" "}
              {dateStats.durationDays} dias.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Zoom"
              options={[
                ["day", "Dia"],
                ["week", "Semana"],
                ["month", "Mes"],
                ["quarter", "Trimestre"]
              ]}
              value={zoom}
              onChange={(value) => setZoom(value as GanttZoom)}
            />
            <SegmentedControl
              label="Agrupacion"
              options={[
                ["assignee", "Responsable"],
                ["principal", "Principal"]
              ]}
              value={groupMode}
              onChange={(value) => setGroupMode(value as GanttGroupMode)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <label className="inline-flex items-center gap-2">
              <input
                checked={hideDone}
                className="size-4 accent-primary"
                onChange={(event) => setHideDone(event.target.checked)}
                type="checkbox"
              />
              Ocultar finalizadas
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                checked={overdueOnly}
                className="size-4 accent-primary"
                onChange={(event) => setOverdueOnly(event.target.checked)}
                type="checkbox"
              />
              Solo vencidas
            </label>
            <span className="inline-flex items-center gap-2 rounded-sm border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
              Líneas de bloqueo activas
            </span>
          </div>

          <div className="max-h-[660px] overflow-auto rounded-md border bg-background dark:border-zinc-800 dark:bg-zinc-950">
            <div
              className="relative min-w-max"
              style={{ width: leftColumnWidth + timeline.width }}
            >
              <div
                className="sticky top-0 z-30 grid border-b bg-muted/80 text-xs font-semibold text-muted-foreground backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-300"
                style={{
                  gridTemplateColumns: `${leftColumnWidth}px ${timeline.width}px`,
                  minHeight: stickyHeaderHeight
                }}
              >
                <div
                  className="sticky left-0 z-40 border-r bg-muted px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                  style={{ height: stickyHeaderHeight }}
                >
                  {groupMode === "assignee" ? "Usuario / ticket" : "Principal / ticket"}
                </div>
                <div
                  className="relative"
                  style={{ height: stickyHeaderHeight }}
                >
                  <div className="absolute inset-x-0 top-0 h-11">
                    {timeline.units.map((unit) => (
                      <div
                        className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r px-1 text-center text-[11px] leading-none tabular-nums dark:border-zinc-800"
                        key={unit.key}
                        style={{ left: unit.left, width: unit.width }}
                        title={`${formatDateLong(unit.start)} - ${formatDateLong(unit.end)}`}
                      >
                        <span className="block max-w-full truncate whitespace-nowrap leading-[13px]">
                          {unit.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedSprintBars.length ? (
                    <div
                      className="absolute inset-x-0 border-t bg-background/80 dark:border-zinc-800 dark:bg-zinc-950/90"
                      style={{
                        ...getTimelineGridStyle(pxPerDay),
                        height: selectedSprintBars.length * sprintBarHeight,
                        top: timelineHeaderHeight
                      }}
                    >
                      {selectedSprintBars.map((sprint, index) => (
                        <div
                          className="absolute flex items-center justify-center overflow-hidden rounded-sm border border-emerald-500 bg-emerald-50 px-2 text-center text-[11px] font-medium text-emerald-900 shadow-sm dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
                          data-gantt-sprint-bar="true"
                          key={sprint.id}
                          style={{
                            height: 16,
                            left: sprint.left,
                            top: index * sprintBarHeight + 4,
                            width: sprint.width
                          }}
                          title={`${sprint.name}: ${formatDateLong(sprint.start)} - ${formatDateLong(sprint.end)}`}
                        >
                          <span className="truncate">{sprint.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="relative"
                style={{ height: rows.length * rowHeight }}
              >
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 z-0 overflow-visible"
                  height={rows.length * rowHeight}
                  style={{ left: leftColumnWidth }}
                  width={timeline.width}
                >
                    {dependencyLinks.map((link) => {
                      const fromIssue = helpers.issueMap.get(link.from.id);
                      const toIssue = helpers.issueMap.get(link.to.id);
                      if (!fromIssue || !toIssue) return null;
                      const fromMetrics = helpers.getMetrics(fromIssue);
                      const toMetrics = helpers.getMetrics(toIssue);
                      const fromRow = issueRowIndex.get(fromIssue.id);
                      const toRow = issueRowIndex.get(toIssue.id);
                      if (fromRow === undefined || toRow === undefined) return null;
                      const fromLeft =
                        getDayOffset(fromMetrics.startDate, timeline.start) * pxPerDay;
                      const toLeft =
                        getDayOffset(toMetrics.startDate, timeline.start) * pxPerDay;
                      const toRight =
                        toLeft +
                        getDurationDays(toMetrics.startDate, toMetrics.dueDate) *
                          pxPerDay;
                      const x1 = fromLeft;
                      const x2 = toRight;
                      const y1 = fromRow * rowHeight + rowHeight / 2;
                      const y2 = toRow * rowHeight + rowHeight / 2;
                      const midX = Math.min(x1 - 32, (x1 + x2) / 2);

                      return (
                        <g key={link.id}>
                          <path
                            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                            fill="none"
                            opacity={link.isBlockingUntilDone ? 0.95 : 0.65}
                            stroke="rgb(107 114 128)"
                            strokeDasharray={link.isBlockingUntilDone ? undefined : "5 4"}
                            strokeLinecap="round"
                            strokeWidth="1.6"
                          >
                          <title>
                            Está bloqueada por:{" "}
                            {fromIssue.code} - {toIssue.code}
                          </title>
                          </path>
                          <GanttDependencyNode x={x1} y={y1} />
                          <GanttDependencyNode x={x2} y={y2} />
                        </g>
                      );
                    })}
                </svg>

                {rows.map((row, rowIndex) => {
                  if (row.type === "group") {
                    return (
                      <div
                        className="absolute grid border-b bg-muted/40 dark:border-zinc-800 dark:bg-zinc-900/70"
                        key={row.id}
                        style={{
                          gridTemplateColumns: `${leftColumnWidth}px ${timeline.width}px`,
                          height: rowHeight,
                          top: rowIndex * rowHeight
                        }}
                      >
                        <div className="sticky left-0 z-20 min-w-0 border-r bg-muted/95 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                          <div className="truncate text-sm font-semibold">
                            {row.group.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground dark:text-zinc-400">
                            {row.group.issues.length} tareas
                            {row.group.subtitle ? ` · ${row.group.subtitle}` : ""}
                          </div>
                        </div>
                        <div
                          className="h-full"
                          style={getTimelineGridStyle(pxPerDay)}
                        />
                      </div>
                    );
                  }

                  const issue = row.issue;
                  const metrics = helpers.getMetrics(issue);
                  const offset = getDayOffset(metrics.startDate, timeline.start);
                  const duration = getDurationDays(metrics.startDate, metrics.dueDate);
                  const left = offset * pxPerDay;
                  const width = Math.max(duration * pxPerDay, 30);

                  return (
                    <button
                      className="absolute grid w-full border-b text-left transition hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-800 dark:hover:bg-zinc-900"
                      key={issue.id}
                      onClick={() => onOpenIssue(issue.id)}
                      style={{
                        gridTemplateColumns: `${leftColumnWidth}px ${timeline.width}px`,
                        height: rowHeight,
                        top: rowIndex * rowHeight
                      }}
                      title={[
                        `${issue.code} ${issue.title}`,
                        `Estado: ${statusLabels[issue.status]}`,
                        `Responsable: ${issue.assignee.name}`,
                        `Inicio: ${formatDateLong(metrics.startDate)}`,
                        `Vencimiento: ${formatDateLong(metrics.dueDate)}`,
                        `Estimacion: ${formatMinutes(metrics.estimate)}`
                      ].join("\n")}
                      type="button"
                    >
                      <div
                        className={cn(
                          "sticky left-0 z-20 min-w-0 border-r bg-background px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950",
                          issue.parentIssueId && "pl-8"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="ticket-code font-mono text-xs font-semibold text-primary">
                            {issue.code}
                          </span>
                          <span className="truncate text-sm font-medium">
                            {issue.title}
                          </span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground dark:text-zinc-400">
                          <span
                            className={cn(
                              "rounded-sm border px-1.5 py-0.5",
                              statusBadgeClasses[issue.status]
                            )}
                          >
                            {statusLabels[issue.status]}
                          </span>
                          <span className="truncate">
                            {issue.epic?.name ?? "Sin epica"}
                          </span>
                          <span>{formatMinutes(metrics.estimate)}</span>
                        </div>
                      </div>
                      <div
                        className="relative h-full"
                        style={getTimelineGridStyle(pxPerDay)}
                      >
                        <div
                          className={cn(
                            "absolute top-4 z-10 h-6 overflow-hidden rounded-sm text-[11px] font-semibold text-white shadow-sm",
                            statusBarClasses[issue.status],
                            metrics.isOverdue && "ring-2 ring-red-500"
                          )}
                          style={{ left, width }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-white/25"
                            style={{ width: `${metrics.progress}%` }}
                          />
                          <span className="ticket-code absolute inset-0 flex items-center px-2">
                            {issue.code}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Seguimiento diario</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dailyTrackingRows.length} filas visibles.
                  </p>
                </div>
                <Button
                  aria-label="Exportar seguimiento diario"
                  className="size-8 rounded-full p-0"
                  onClick={exportDailyTracking}
                  type="button"
                  variant="outline"
                >
                  <Download className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {dailyTrackingRows.length ? (
                  <div className="max-h-[520px] overflow-y-auto overflow-x-hidden rounded-lg border">
                    <div className="sticky top-0 z-20 grid grid-cols-[0.9fr_0.55fr_minmax(0,1.5fr)_0.75fr_0.75fr_0.85fr_0.8fr_1.15fr_0.75fr] items-center gap-2 border-b bg-background px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <SortableGridHeader
                        label="Usuario asignado"
                        onSortChange={setDailyTrackingSort}
                        sortKey="assignee"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Ticket"
                        onSortChange={setDailyTrackingSort}
                        sortKey="code"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Descripcion"
                        onSortChange={setDailyTrackingSort}
                        sortKey="title"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Estado"
                        onSortChange={setDailyTrackingSort}
                        sortKey="status"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Start day"
                        onSortChange={setDailyTrackingSort}
                        sortKey="startDate"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Fecha de ven..."
                        onSortChange={setDailyTrackingSort}
                        sortKey="dueDate"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Estimacion or..."
                        onSortChange={setDailyTrackingSort}
                        sortKey="estimate"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Seguimiento de tiempo"
                        onSortChange={setDailyTrackingSort}
                        sortKey="timeSpent"
                        sortState={dailyTrackingSort}
                      />
                      <SortableGridHeader
                        label="Registros"
                        onSortChange={setDailyTrackingSort}
                        sortKey="worklogs"
                        sortState={dailyTrackingSort}
                      />
                    </div>
                    <div>
                      {sortedDailyTrackingRows.map((row) => {
                        const isExpanded = expandedTimeRows.has(row.issue.id);
                        return (
                          <div
                            className="border-b last:border-b-0"
                            key={row.issue.id}
                          >
                            <div className="grid grid-cols-[0.9fr_0.55fr_minmax(0,1.5fr)_0.75fr_0.75fr_0.85fr_0.8fr_1.15fr_0.75fr] items-center gap-2 px-3 py-3 text-xs">
                              <span className="min-w-0 truncate font-medium">
                                {row.issue.assignee.name}
                              </span>
                              <button
                                className="ticket-code min-w-0 truncate text-left font-mono text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => onOpenIssue(row.issue.id)}
                                type="button"
                              >
                                {row.issue.code}
                              </button>
                              <span
                                className="min-w-0 truncate"
                                title={row.issue.title}
                              >
                                {row.issue.title}
                              </span>
                              <span
                                className={cn(
                                  "min-w-0 max-w-full truncate rounded-full border px-2 py-1 text-center text-[11px] font-semibold",
                                  statusBadgeClasses[row.issue.status]
                                )}
                              >
                                {statusLabels[row.issue.status]}
                              </span>
                              <span className="min-w-0 truncate">{formatDateLong(row.metrics.startDate)}</span>
                              <span className="min-w-0 truncate">{formatDateLong(row.metrics.dueDate)}</span>
                              <span className="min-w-0 truncate">{formatMinutes(row.metrics.estimate)}</span>
                              <span className="min-w-0 truncate font-semibold">
                                Usado: {formatCompactMinutes(row.metrics.timeSpent)} |
                                Restante:{" "}
                                {formatCompactMinutes(row.metrics.timeRemaining)}
                              </span>
                              <Button
                                className="h-8 min-w-0 max-w-full justify-self-start rounded-full px-2 text-[11px]"
                                onClick={() => toggleTimeRow(row.issue.id)}
                                type="button"
                                variant="outline"
                              >
                                {isExpanded ? "Ocultar" : "Ver registros"}
                              </Button>
                            </div>
                            {isExpanded ? (
                              <DailyTrackingDetails
                                expandedRows={expandedTimeRows}
                                helpers={helpers}
                                onOpenIssue={onOpenIssue}
                                onToggleRow={toggleTimeRow}
                                row={row}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <EmptyPanel title="No hay seguimiento diario calculable" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Pendientes por estimar</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {missingEstimateGroups.filter((group) => group.totalPending > 0).length}{" "}
                    responsables con pendientes / {missingEstimateGroups.length}{" "}
                    responsables visibles.
                  </p>
                </div>
                <Button
                  aria-label="Exportar pendientes por estimar"
                  className="size-8 rounded-full p-0"
                  onClick={exportMissingEstimates}
                  type="button"
                  variant="outline"
                >
                  <Download className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {missingEstimateGroups.length ? (
                  <div className="max-h-[420px] overflow-y-auto overflow-x-hidden rounded-lg border">
                    <div className="sticky top-0 z-20 grid grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.85fr_0.95fr_0.85fr] items-center gap-2 border-b bg-background px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <SortableGridHeader
                        label="Usuario asignado"
                        onSortChange={setMissingEstimateSort}
                        sortKey="assignee"
                        sortState={missingEstimateSort}
                      />
                      <SortableGridHeader
                        label="Total pendientes"
                        onSortChange={setMissingEstimateSort}
                        sortKey="total"
                        sortState={missingEstimateSort}
                      />
                      <SortableGridHeader
                        label="Sin start date"
                        onSortChange={setMissingEstimateSort}
                        sortKey="missingStartDate"
                        sortState={missingEstimateSort}
                      />
                      <SortableGridHeader
                        label="Sin fecha vencimiento"
                        onSortChange={setMissingEstimateSort}
                        sortKey="missingDueDate"
                        sortState={missingEstimateSort}
                      />
                      <SortableGridHeader
                        label="Sin estimacion original"
                        onSortChange={setMissingEstimateSort}
                        sortKey="missingEstimate"
                        sortState={missingEstimateSort}
                      />
                      <SortableGridHeader
                        label="Seguimiento diar..."
                        onSortChange={setMissingEstimateSort}
                        sortKey="missingDailyTracking"
                        sortState={missingEstimateSort}
                      />
                    </div>
                    <div>
                      {sortedMissingEstimateGroups.map((group) => {
                        const isExpanded = expandedMissingGroups.has(group.assigneeId);
                        return (
                          <div className="border-b last:border-b-0" key={group.assigneeId}>
                            <div className="grid grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.85fr_0.95fr_0.85fr] items-center gap-2 px-3 py-3 text-xs">
                              <span className="min-w-0 truncate font-medium">
                                {group.assigneeName}
                              </span>
                              <span className="font-semibold">{group.totalPending}</span>
                              <span className="font-semibold">{group.missingStartDate}</span>
                              <span className="font-semibold">{group.missingDueDate}</span>
                              <span className="font-semibold">{group.missingEstimate}</span>
                              <Button
                                className="h-8 min-w-0 max-w-full justify-self-start rounded-full px-2 text-[11px]"
                                disabled={!group.missingEstimate}
                                onClick={() => toggleMissingGroup(group.assigneeId)}
                                type="button"
                                variant="outline"
                              >
                                {!group.missingEstimate
                                  ? "Sin pendientes"
                                  : isExpanded
                                    ? "Ocultar"
                                    : "Ver tickets"}
                              </Button>
                            </div>
                            {isExpanded ? (
                              <MissingEstimateDetails
                                group={group}
                                onOpenIssue={onOpenIssue}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <EmptyPanel title="No hay pendientes por estimar" />
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type GanttZoom = "day" | "week" | "month" | "quarter";
type GanttGroupMode = "assignee" | "principal";
type GanttRow =
  | { id: string; type: "group"; group: IssueGroup }
  | { id: string; type: "issue"; issue: PlanningIssueDTO; group: IssueGroup };

const zoomConfig: Record<GanttZoom, { pxPerDay: number }> = {
  day: { pxPerDay: 46 },
  week: { pxPerDay: 16 },
  month: { pxPerDay: 5.5 },
  quarter: { pxPerDay: 2.5 }
};

function buildGanttRows(groups: IssueGroup[]) {
  return groups.flatMap<GanttRow>((group) => [
    { id: `group-${group.id}`, type: "group", group },
    ...group.issues.map((issue) => ({
      id: issue.id,
      type: "issue" as const,
      issue,
      group
    }))
  ]);
}

function GanttDependencyNode({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 14} ${y - 8})`}>
      <rect fill="#c084fc" height="16" rx="3" width="28" />
      <path
        d="M11.4 6.1 9.8 4.5a2.2 2.2 0 0 0-3.1 0l-1.2 1.2a2.2 2.2 0 0 0 0 3.1l1.2 1.2M16.6 9.9l1.6 1.6a2.2 2.2 0 0 0 3.1 0l1.2-1.2a2.2 2.2 0 0 0 0-3.1l-1.2-1.2M9.9 10.1l6.2-4.2"
        fill="none"
        stroke="#4c1d95"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </g>
  );
}

type DailyTrackingRow = {
  issue: PlanningIssueDTO;
  metrics: IssueMetrics;
};

type MissingEstimateGroup = {
  assigneeId: string;
  assigneeName: string;
  issues: DailyTrackingRow[];
  totalPending: number;
  missingStartDate: number;
  missingDueDate: number;
  missingEstimate: number;
  missingDailyTracking: number;
};

function buildDailyTrackingRows(
  issues: PlanningIssueDTO[],
  helpers: ReturnType<typeof createIssueHelpers>
): DailyTrackingRow[] {
  const parentIssues = new Map<string, PlanningIssueDTO>();

  for (const issue of issues) {
    const parentIssue = issue.parentIssueId
      ? helpers.issueMap.get(issue.parentIssueId)
      : issue;

    if (parentIssue) {
      parentIssues.set(parentIssue.id, parentIssue);
    }
  }

  return [...parentIssues.values()]
    .map((issue) => ({
      issue,
      metrics: helpers.getMetrics(issue)
    }))
    .sort(
      (a, b) =>
        a.issue.assignee.name.localeCompare(b.issue.assignee.name) ||
        getSortableDate(a.metrics.startDate) - getSortableDate(b.metrics.startDate) ||
        a.issue.code.localeCompare(b.issue.code)
    );
}

function buildMissingEstimateGroups(
  issues: PlanningIssueDTO[],
  helpers: ReturnType<typeof createIssueHelpers>
): MissingEstimateGroup[] {
  const groups = new Map<string, MissingEstimateGroup>();

  for (const issue of issues) {
    const metrics = helpers.getMetrics(issue);
    const row = { issue, metrics };
    const group =
      groups.get(issue.assigneeId) ??
      {
        assigneeId: issue.assigneeId,
        assigneeName: issue.assignee.name || "Sin responsable",
        issues: [],
        totalPending: 0,
        missingStartDate: 0,
        missingDueDate: 0,
        missingEstimate: 0,
        missingDailyTracking: 0
      };

    const hasMissingStartDate = !metrics.startDate;
    const hasMissingDueDate = !metrics.dueDate;
    const hasMissingEstimate = !metrics.estimate;
    const hasMissingDailyTracking = !issue.worklogs.length;

    if (hasMissingStartDate) group.missingStartDate += 1;
    if (hasMissingDueDate) group.missingDueDate += 1;
    if (hasMissingEstimate) group.missingEstimate += 1;
    if (hasMissingDailyTracking) group.missingDailyTracking += 1;

    if (
      hasMissingStartDate ||
      hasMissingDueDate ||
      hasMissingEstimate ||
      hasMissingDailyTracking
    ) {
      group.issues.push(row);
      group.totalPending += 1;
    }

    groups.set(issue.assigneeId, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      issues: group.issues.sort(
        (a, b) =>
          getSortableDate(a.metrics.startDate) - getSortableDate(b.metrics.startDate) ||
          a.issue.code.localeCompare(b.issue.code)
      )
    }))
    .sort(
      (a, b) =>
        b.totalPending - a.totalPending ||
        a.assigneeName.localeCompare(b.assigneeName)
    );
}

function getRowsMissingOriginalEstimate(group: MissingEstimateGroup) {
  return group.issues.filter((row) => !row.metrics.estimate);
}

function getDailyTrackingSortValue(
  row: DailyTrackingRow,
  key: DailyTrackingSortKey
): SortableValue {
  if (key === "assignee") return row.issue.assignee.name;
  if (key === "code") return row.issue.code;
  if (key === "title") return row.issue.title;
  if (key === "status") return statusLabels[row.issue.status];
  if (key === "startDate") return row.metrics.startDate;
  if (key === "dueDate") return row.metrics.dueDate;
  if (key === "estimate") return row.metrics.estimate;
  if (key === "timeSpent") return row.metrics.timeSpent;
  return row.issue.worklogs.length;
}

function getMissingEstimateGroupSortValue(
  group: MissingEstimateGroup,
  key: MissingEstimateSortKey
): SortableValue {
  if (key === "assignee") return group.assigneeName;
  if (key === "total") return group.totalPending;
  if (key === "missingStartDate") return group.missingStartDate;
  if (key === "missingDueDate") return group.missingDueDate;
  if (key === "missingEstimate") return group.missingEstimate;
  return group.missingDailyTracking;
}

function getMissingEstimateDetailSortValue(
  row: DailyTrackingRow,
  key: MissingEstimateDetailSortKey
): SortableValue {
  if (key === "code") return row.issue.code;
  if (key === "title") return row.issue.title;
  if (key === "status") return statusLabels[row.issue.status];
  if (key === "startDate") return row.metrics.startDate;
  if (key === "dueDate") return row.metrics.dueDate;
  return row.metrics.estimate;
}

function getWorklogSortValue(
  worklog: PlanningIssueDTO["worklogs"][number],
  key: WorklogSortKey
): SortableValue {
  if (key === "description") return worklog.description;
  if (key === "createdAt") return new Date(worklog.createdAt);
  return worklog.timeSpent;
}

function getDailySubtaskSortValue(
  subtask: PlanningIssueDTO,
  key: DailySubtaskSortKey
): SortableValue {
  if (key === "code") return subtask.code;
  if (key === "title") return subtask.title;
  if (key === "assignee") return subtask.assignee.name;
  if (key === "status") return statusLabels[subtask.status];
  if (key === "timeSpent") return getWorklogTotal(subtask.worklogs);
  return subtask.worklogs.length;
}

function getSortedWorklogs(worklogs: PlanningIssueDTO["worklogs"]) {
  return [...worklogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getWorklogTotal(worklogs: PlanningIssueDTO["worklogs"]) {
  return worklogs.reduce((sum, worklog) => sum + worklog.timeSpent, 0);
}

function getIssueHierarchyWorklogCount(
  issue: PlanningIssueDTO,
  helpers: ReturnType<typeof createIssueHelpers>
) {
  return (
    issue.worklogs.length +
    helpers
      .getChildren(issue)
      .reduce((sum, child) => sum + child.worklogs.length, 0)
  );
}

function buildIssueWorklogExportRows(
  issue: PlanningIssueDTO,
  type: "Tarea" | "Subtarea",
  parentCode = ""
) {
  const worklogs = getSortedWorklogs(issue.worklogs);

  if (!worklogs.length) {
    return [
      [
        type,
        issue.code,
        parentCode,
        type === "Tarea"
          ? "Sin tiempo registrado directamente"
          : "Sin tiempo registrado",
        "",
        "0m",
        "",
        "",
        "",
        ""
      ]
    ];
  }

  return worklogs.map((worklog) => [
    type,
    issue.code,
    parentCode,
    worklog.description,
    formatDateTime(worklog.createdAt),
    formatMinutes(worklog.timeSpent),
    "",
    "",
    "",
    ""
  ]);
}

function buildDailyTrackingExportRows(
  row: DailyTrackingRow,
  helpers: ReturnType<typeof createIssueHelpers>
) {
  const childRows = helpers.getChildren(row.issue).flatMap((child) =>
    buildIssueWorklogExportRows(child, "Subtarea", row.issue.code)
  );

  return [
    ...buildIssueWorklogExportRows(row.issue, "Tarea"),
    ...childRows
  ];
}

function DailyTrackingDetails({
  expandedRows,
  helpers,
  onOpenIssue,
  onToggleRow,
  row
}: {
  expandedRows: Set<string>;
  helpers: ReturnType<typeof createIssueHelpers>;
  onOpenIssue: (issueId: string) => void;
  onToggleRow: (issueId: string) => void;
  row: DailyTrackingRow;
}) {
  const [subtaskSort, setSubtaskSort] = React.useState<
    SortState<DailySubtaskSortKey>
  >({ key: "code", direction: "asc" });
  const subtasks = React.useMemo(
    () =>
      sortByState(helpers.getChildren(row.issue), subtaskSort, (subtask, key) =>
        getDailySubtaskSortValue(subtask, key)
      ),
    [helpers, row.issue, subtaskSort]
  );

  return (
    <div className="border-l-2 border-primary bg-muted/20 px-3 py-3">
      <div className="space-y-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Registros de la tarea
            </h4>
            <span className="shrink-0 rounded-full border bg-background px-2 py-1 text-[11px] font-semibold">
              {formatCompactMinutes(getWorklogTotal(row.issue.worklogs))}
            </span>
          </div>
          <DailyWorklogList
            emptyMessage="Esta tarea no tiene horas registradas directamente."
            worklogs={row.issue.worklogs}
          />
        </section>

        {subtasks.length ? (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subtareas
            </h4>
            <div className="grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.7fr_0.75fr_0.8fr] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <SortableGridHeader
                label="Subtarea"
                onSortChange={setSubtaskSort}
                sortKey="code"
                sortState={subtaskSort}
              />
              <SortableGridHeader
                label="Responsable"
                onSortChange={setSubtaskSort}
                sortKey="assignee"
                sortState={subtaskSort}
              />
              <SortableGridHeader
                label="Estado"
                onSortChange={setSubtaskSort}
                sortKey="status"
                sortState={subtaskSort}
              />
              <SortableGridHeader
                label="Horas"
                onSortChange={setSubtaskSort}
                sortKey="timeSpent"
                sortState={subtaskSort}
              />
              <SortableGridHeader
                label="Registros"
                onSortChange={setSubtaskSort}
                sortKey="worklogs"
                sortState={subtaskSort}
              />
            </div>
            <div className="grid gap-2">
              {subtasks.map((subtask) => {
                const isExpanded = expandedRows.has(subtask.id);
                const total = getWorklogTotal(subtask.worklogs);

                return (
                  <div
                    className="rounded-md border bg-background"
                    key={subtask.id}
                  >
                    <div className="grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.7fr_0.75fr_0.8fr] items-center gap-2 px-3 py-2 text-xs">
                      <button
                        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onOpenIssue(subtask.id)}
                        type="button"
                      >
                        <span className="ticket-code block truncate font-mono font-semibold text-primary">
                          {subtask.code}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {subtask.title}
                        </span>
                      </button>
                      <span className="min-w-0 truncate">
                        {subtask.assignee.name}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 truncate rounded-full border px-2 py-1 text-center text-[11px] font-semibold",
                          statusBadgeClasses[subtask.status]
                        )}
                      >
                        {statusLabels[subtask.status]}
                      </span>
                      <span className="min-w-0 truncate font-semibold">
                        {formatCompactMinutes(total)}
                      </span>
                      <Button
                        className="h-8 min-w-0 max-w-full justify-self-start rounded-full px-2 text-[11px]"
                        onClick={() => onToggleRow(subtask.id)}
                        type="button"
                        variant="outline"
                      >
                        {isExpanded ? "Ocultar" : "Ver registros"}
                      </Button>
                    </div>
                    {isExpanded ? (
                      <div className="border-t bg-muted/20 px-3 py-3">
                        <DailyWorklogList
                          emptyMessage="Esta subtarea no tiene horas registradas."
                          worklogs={subtask.worklogs}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function DailyWorklogList({
  emptyMessage,
  worklogs
}: {
  emptyMessage: string;
  worklogs: PlanningIssueDTO["worklogs"];
}) {
  const [worklogSort, setWorklogSort] = React.useState<SortState<WorklogSortKey>>({
    key: "createdAt",
    direction: "desc"
  });
  const sortedWorklogs = React.useMemo(
    () => sortByState(worklogs, worklogSort, getWorklogSortValue),
    [worklogSort, worklogs]
  );

  if (!sortedWorklogs.length) {
    return (
      <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_0.38fr_0.26fr] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <SortableGridHeader
          label="Descripcion"
          onSortChange={setWorklogSort}
          sortKey="description"
          sortState={worklogSort}
        />
        <SortableGridHeader
          label="Fecha y hora registro"
          onSortChange={setWorklogSort}
          sortKey="createdAt"
          sortState={worklogSort}
        />
        <SortableGridHeader
          label="Horas registradas"
          onSortChange={setWorklogSort}
          sortKey="timeSpent"
          sortState={worklogSort}
        />
      </div>
      {sortedWorklogs.map((worklog) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_0.38fr_0.26fr] gap-2 rounded-md border bg-background px-3 py-2 text-xs"
          key={worklog.id}
        >
          <span className="min-w-0 text-muted-foreground">
            {worklog.description || "Sin descripcion registrada."}
          </span>
          <span className="min-w-0 truncate">
            {formatDateTime(worklog.createdAt)}
          </span>
          <span className="min-w-0 truncate font-semibold">
            {formatCompactMinutes(worklog.timeSpent)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MissingEstimateDetails({
  group,
  onOpenIssue
}: {
  group: MissingEstimateGroup;
  onOpenIssue: (issueId: string) => void;
}) {
  const [detailSort, setDetailSort] = React.useState<
    SortState<MissingEstimateDetailSortKey>
  >({ key: "code", direction: "asc" });
  const rowsMissingEstimate = React.useMemo(
    () =>
      sortByState(
        getRowsMissingOriginalEstimate(group),
        detailSort,
        getMissingEstimateDetailSortValue
      ),
    [detailSort, group]
  );

  return (
    <div className="border-l-2 border-orange-600 bg-muted/20 px-3 py-3">
      {rowsMissingEstimate.length ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-[0.55fr_minmax(0,1.8fr)_0.75fr_0.75fr_0.9fr_0.85fr] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <SortableGridHeader
              label="Ticket"
              onSortChange={setDetailSort}
              sortKey="code"
              sortState={detailSort}
            />
            <SortableGridHeader
              label="Descripcion"
              onSortChange={setDetailSort}
              sortKey="title"
              sortState={detailSort}
            />
            <SortableGridHeader
              label="Estado"
              onSortChange={setDetailSort}
              sortKey="status"
              sortState={detailSort}
            />
            <SortableGridHeader
              label="Start day"
              onSortChange={setDetailSort}
              sortKey="startDate"
              sortState={detailSort}
            />
            <SortableGridHeader
              label="Fecha de vencimiento"
              onSortChange={setDetailSort}
              sortKey="dueDate"
              sortState={detailSort}
            />
            <SortableGridHeader
              label="Estimacion original"
              onSortChange={setDetailSort}
              sortKey="estimate"
              sortState={detailSort}
            />
          </div>
          {rowsMissingEstimate.map((row) => (
            <button
              className="grid grid-cols-[0.55fr_minmax(0,1.8fr)_0.75fr_0.75fr_0.9fr_0.85fr] gap-2 rounded-md border bg-background px-3 py-2 text-left text-xs transition hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={row.issue.id}
              onClick={() => onOpenIssue(row.issue.id)}
              type="button"
            >
              <span className="ticket-code min-w-0 truncate font-mono font-semibold text-primary">
                {row.issue.code}
              </span>
              <span className="min-w-0 truncate" title={row.issue.title}>
                {row.issue.title}
              </span>
              <span
                className={cn(
                  "min-w-0 max-w-full truncate rounded-full border px-2 py-1 text-center text-[11px] font-semibold",
                  statusBadgeClasses[row.issue.status]
                )}
              >
                {statusLabels[row.issue.status]}
              </span>
              <span className="min-w-0 truncate">{formatDateLong(row.metrics.startDate)}</span>
              <span className="min-w-0 truncate">{formatDateLong(row.metrics.dueDate)}</span>
              <span className="min-w-0 truncate">{formatMinutes(row.metrics.estimate)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
          Este responsable no tiene tickets pendientes por estimar.
        </p>
      )}
    </div>
  );
}

function getGanttDateStats(
  issues: PlanningIssueDTO[],
  helpers: ReturnType<typeof createIssueHelpers>
) {
  const dates = issues.flatMap((issue) => {
    const metrics = helpers.getMetrics(issue);
    return [metrics.startDate, metrics.dueDate].filter(
      (date): date is Date => Boolean(date)
    );
  });
  const today = stripTimeLocal(new Date());

  if (!dates.length) {
    return {
      start: today,
      end: today,
      durationDays: 1
    };
  }

  const start = new Date(Math.min(...dates.map((date) => date.getTime())));
  const end = new Date(Math.max(...dates.map((date) => date.getTime())));

  return {
    start,
    end,
    durationDays: getDurationDays(start, end)
  };
}

function buildTimelineUnits(
  start: Date,
  end: Date,
  zoom: GanttZoom,
  pxPerDay: number
) {
  const units: Array<{
    key: string;
    label: string;
    start: Date;
    end: Date;
    left: number;
    width: number;
  }> = [];
  let cursor = alignTimelineStart(start, zoom);
  const last = stripTimeLocal(end);

  while (cursor <= last) {
    const unitEnd = getTimelineUnitEnd(cursor, zoom);
    const clippedStart = cursor < start ? start : cursor;
    const clippedEnd = unitEnd > last ? last : unitEnd;
    const left = Math.max(0, diffDaysLocal(start, clippedStart) * pxPerDay);
    const width =
      (Math.max(0, diffDaysLocal(clippedStart, clippedEnd)) + 1) * pxPerDay;

    units.push({
      key: `${zoom}-${cursor.toISOString()}`,
      label: formatTimelineUnitLabel(cursor, zoom),
      start: clippedStart,
      end: clippedEnd,
      left,
      width
    });

    cursor = addDaysLocal(unitEnd, 1);
  }

  return units;
}

function alignTimelineStart(date: Date, zoom: GanttZoom) {
  const current = stripTimeLocal(date);
  if (zoom === "day") return current;

  if (zoom === "week") {
    const day = current.getDay() || 7;
    return addDaysLocal(current, 1 - day);
  }

  if (zoom === "month") {
    return new Date(current.getFullYear(), current.getMonth(), 1);
  }

  const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
  return new Date(current.getFullYear(), quarterStartMonth, 1);
}

function getTimelineUnitEnd(date: Date, zoom: GanttZoom) {
  if (zoom === "day") return stripTimeLocal(date);
  if (zoom === "week") return addDaysLocal(date, 6);
  if (zoom === "month") {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth + 3, 0);
}

function formatTimelineUnitLabel(date: Date, zoom: GanttZoom) {
  if (zoom === "day") return formatTimelineDayLabel(date);

  if (zoom === "week") {
    return `Sem ${getWeekNumber(date)}`;
  }

  if (zoom === "month") {
    return new Intl.DateTimeFormat("es-CO", {
      month: "short",
      year: "2-digit"
    }).format(date);
  }

  return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function formatTimelineDayLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short"
  })
    .format(date)
    .replace(/\./g, "")
    .replace(/\s+de\s+/i, " ");
}

function getWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getTimelineGridStyle(pxPerDay: number): React.CSSProperties {
  return {
    backgroundImage:
      "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)",
    backgroundSize: `${Math.max(pxPerDay, 8)}px 100%`
  };
}

function formatCompactMinutes(minutes?: number | null) {
  return formatJiraEstimate(minutes) || "0h";
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getSortableDate(date: Date | null) {
  return date?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function addDaysLocal(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return stripTimeLocal(next);
}

function diffDaysLocal(start: Date, end: Date) {
  return Math.round(
    (stripTimeLocal(end).getTime() - stripTimeLocal(start).getTime()) /
      86400000
  );
}

function stripTimeLocal(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function SegmentedControl({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex rounded-md border bg-background p-1 dark:border-zinc-800 dark:bg-zinc-900"
      role="group"
    >
      {options.map(([optionValue, optionLabel]) => (
        <button
          className={cn(
            "h-7 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground dark:text-zinc-400 dark:hover:text-zinc-100",
            value === optionValue &&
              "bg-accent text-accent-foreground shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
          )}
          key={optionValue}
          onClick={() => onChange(optionValue)}
          type="button"
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

function PertView({
  helpers,
  issues,
  onOpenIssue
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  issues: PlanningIssueDTO[];
  onOpenIssue: (issueId: string) => void;
}) {
  const links = React.useMemo(
    () => buildDependencyLinks(issues, "is_blocked_by"),
    [issues]
  );
  const bottlenecks = React.useMemo(
    () => getBottlenecks(issues, helpers),
    [helpers, issues]
  );
  const graphLayout = React.useMemo(
    () => buildPertGraphLayout(links, helpers, bottlenecks),
    [bottlenecks, helpers, links]
  );
  const dependencyCount = React.useMemo(
    () =>
      new Set(
        links.map(
          (link) => `${link.originalBlockerIssueId}:${link.originalBlockedIssueId}`
        )
      ).size,
    [links]
  );
  const linkedIssueCount = React.useMemo(() => {
    const ids = new Set<string>();
    links.forEach((link) => {
      ids.add(link.from.id);
      ids.add(link.to.id);
    });
    return ids.size;
  }, [links]);
  const highestRisk = bottlenecks[0]?.score ?? 0;

  if (!issues.length) {
    return <EmptyPanel title="Sin tareas visibles" />;
  }

  function exportPert() {
    downloadCsv("pert-dependencias.csv", [
      [
        "Seccion",
        "Relacion",
        "Origen",
        "Titulo origen",
        "Destino",
        "Titulo destino",
        "Bloqueo total",
        "Responsable origen",
        "Responsable destino"
      ],
      ...links.map((link) => [
        "Dependencia",
        getDependencyRelationLabel(link.relation),
        link.from.code,
        link.from.title,
        link.to.code,
        link.to.title,
        link.isBlockingUntilDone ? "Si" : "No",
        link.from.assignee.name,
        link.to.assignee.name
      ]),
      [
        "Cuello de botella",
        "Puntaje",
        "Codigo",
        "Titulo",
        "Bloquea",
        "Depende de",
        "Trabajo aguas abajo",
        "Estado",
        "Nivel"
      ],
      ...bottlenecks.map((item) => [
        "Cuello de botella",
        item.score,
        item.issue.code,
        item.issue.title,
        item.blockingCount,
        item.blockedByCount,
        formatMinutes(item.downstreamEstimate),
        statusLabels[item.issue.status],
        item.riskLevel
      ])
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          helper={`${linkedIssueCount} actividades vinculadas`}
          icon={Network}
          label="Dependencias"
          value={dependencyCount}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Cuellos de botella"
          value={bottlenecks.length}
        />
        <MetricCard
          helper="Mayor puntaje visible"
          icon={Activity}
          label="Riesgo PERT"
          value={highestRisk}
        />
      </div>

      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Diagrama PERT de dependencias</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Muestra actividades vinculadas, sentido de la relacion y bloqueo total
              cuando aplica.
            </p>
          </div>
          <Button onClick={exportPert} size="sm" type="button" variant="outline">
            <Download />
            Excel
          </Button>
        </CardHeader>
        <CardContent>
          {false ? (<div className="sr-only">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
              Está bloqueada por: sale por la izquierda y conecta con la derecha
              de la tarea bloqueante
            </span>
            <span className="rounded-full border px-2.5 py-1">
              Linea continua = bloqueo total hasta finalizar
            </span>
          </div>) : null}

          {links.length ? (
            <PertDependencyGraph
              helpers={helpers}
              layout={graphLayout}
              onOpenIssue={onOpenIssue}
            />
          ) : (
            <EmptyPanel title="No hay dependencias con los filtros actuales" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuellos de botella detectados</CardTitle>
        </CardHeader>
        <CardContent>
          {bottlenecks.length ? (
            <div className="grid gap-2">
              {bottlenecks.map((item) => (
                <button
                  className={cn(
                    "grid gap-3 rounded-md border border-l-4 p-3 text-left transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[72px_minmax(0,1fr)_220px]",
                    item.riskLevel === "Alto"
                      ? "border-l-red-500"
                      : item.riskLevel === "Medio"
                        ? "border-l-amber-500"
                        : "border-l-blue-500"
                  )}
                  key={item.issue.id}
                  onClick={() => onOpenIssue(item.issue.id)}
                  type="button"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">
                    {item.score}
                  </span>
                  <span className="min-w-0">
                    <span className="ticket-code block font-mono text-xs font-semibold text-primary">
                      {item.issue.code}
                    </span>
                    <span className="block truncate text-sm font-semibold">
                      {item.issue.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Bloquea {item.blockingCount} y depende de{" "}
                      {item.blockedByCount}. Aguas abajo: {item.downstreamCount}{" "}
                      tareas / {formatMinutes(item.downstreamEstimate)}
                    </span>
                  </span>
                  <span className="space-y-1 text-xs text-muted-foreground">
                    <span className="block font-semibold text-foreground">
                      Riesgo {item.riskLevel}
                    </span>
                    <span className="block">
                      {item.isOverdue
                        ? "Vencida"
                        : item.isDueSoon
                          ? "Proxima a vencer"
                          : statusLabels[item.issue.status]}
                    </span>
                    {item.isBlocked ? (
                      <span className="block">Tiene dependencias entrantes</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel title="No hay cuellos de botella visibles" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type PertDependencyLink = ReturnType<typeof buildDependencyLinks>[number];

type PertBottleneck = ReturnType<typeof getBottlenecks>[number];

type PertGraphNode = {
  id: string;
  issue: PlanningIssueDTO;
  level: number;
  row: number;
  x: number;
  y: number;
  riskLevel?: PertBottleneck["riskLevel"];
  riskScore: number;
  isBottleneck: boolean;
};

type PertGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  isBlockingUntilDone: boolean;
};

type PertGraphLayout = {
  cardHeight: number;
  cardWidth: number;
  edges: PertGraphEdge[];
  height: number;
  nodes: PertGraphNode[];
  width: number;
};

function buildPertGraphLayout(
  links: PertDependencyLink[],
  helpers: ReturnType<typeof createIssueHelpers>,
  bottlenecks: PertBottleneck[]
): PertGraphLayout {
  const cardWidth = 274;
  const cardHeight = 142;
  const columnGap = 104;
  const rowGap = 34;
  const padding = 22;
  const nodesById = new Map<string, PlanningIssueDTO>();
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const edgesById = new Map<string, PertGraphEdge>();
  const riskByIssueId = new Map(
    bottlenecks.map((item) => [item.issue.id, item] as const)
  );

  for (const link of links) {
    const source = helpers.issueMap.get(link.to.id);
    const target = helpers.issueMap.get(link.from.id);
    if (!source || !target || source.id === target.id) continue;

    nodesById.set(source.id, source);
    nodesById.set(target.id, target);

    const edgeId = `${source.id}:${target.id}`;
    if (!edgesById.has(edgeId)) {
      edgesById.set(edgeId, {
        id: edgeId,
        sourceId: source.id,
        targetId: target.id,
        isBlockingUntilDone: link.isBlockingUntilDone
      });
    }

    const sourceOutgoing = outgoing.get(source.id) ?? new Set<string>();
    sourceOutgoing.add(target.id);
    outgoing.set(source.id, sourceOutgoing);

    const targetIncoming = incoming.get(target.id) ?? new Set<string>();
    targetIncoming.add(source.id);
    incoming.set(target.id, targetIncoming);

    if (!incoming.has(source.id)) incoming.set(source.id, new Set<string>());
    if (!outgoing.has(target.id)) outgoing.set(target.id, new Set<string>());
  }

  const nodeIds = [...nodesById.keys()];
  const levels = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const indegree = new Map<string, number>(
    nodeIds.map((id) => [id, incoming.get(id)?.size ?? 0] as const)
  );
  const queue = nodeIds
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => comparePertNodes(a, b, nodesById, riskByIssueId));
  const processed = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    processed.add(current);
    const currentLevel = levels.get(current) ?? 0;

    for (const targetId of outgoing.get(current) ?? []) {
      levels.set(targetId, Math.max(levels.get(targetId) ?? 0, currentLevel + 1));
      indegree.set(targetId, Math.max((indegree.get(targetId) ?? 1) - 1, 0));
      if ((indegree.get(targetId) ?? 0) === 0) {
        queue.push(targetId);
        queue.sort((a, b) => comparePertNodes(a, b, nodesById, riskByIssueId));
      }
    }
  }

  for (const id of nodeIds) {
    if (processed.has(id)) continue;
    const parentLevels = [...(incoming.get(id) ?? [])]
      .map((parentId) => levels.get(parentId))
      .filter((level): level is number => level !== undefined);
    levels.set(
      id,
      parentLevels.length ? Math.max(...parentLevels) + 1 : levels.get(id) ?? 0
    );
  }

  const nodesByLevel = new Map<number, string[]>();
  for (const id of nodeIds) {
    const level = levels.get(id) ?? 0;
    const current = nodesByLevel.get(level) ?? [];
    current.push(id);
    nodesByLevel.set(level, current);
  }

  const rowById = new Map<string, number>();
  const sortedLevels = [...nodesByLevel.keys()].sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const ids = nodesByLevel.get(level) ?? [];
    ids.sort((a, b) => {
      const parentA = getPertParentRowAverage(a, incoming, rowById);
      const parentB = getPertParentRowAverage(b, incoming, rowById);
      if (parentA !== parentB) return parentA - parentB;
      return comparePertNodes(a, b, nodesById, riskByIssueId);
    });
    ids.forEach((id, index) => rowById.set(id, index));
  }

  const nodes = nodeIds
    .map((id) => {
      const issue = nodesById.get(id)!;
      const level = levels.get(id) ?? 0;
      const row = rowById.get(id) ?? 0;
      const risk = riskByIssueId.get(id);

      return {
        id,
        issue,
        level,
        row,
        x: padding + level * (cardWidth + columnGap),
        y: padding + row * (cardHeight + rowGap),
        riskLevel: risk?.riskLevel,
        riskScore: risk?.score ?? 0,
        isBottleneck: Boolean(risk)
      };
    })
    .sort((a, b) => a.level - b.level || a.row - b.row);

  const maxLevel = Math.max(0, ...nodes.map((node) => node.level));
  const maxRows = Math.max(
    1,
    ...[...nodesByLevel.values()].map((levelNodes) => levelNodes.length)
  );

  return {
    cardHeight,
    cardWidth,
    edges: [...edgesById.values()],
    height: padding * 2 + maxRows * cardHeight + (maxRows - 1) * rowGap,
    nodes,
    width: padding * 2 + (maxLevel + 1) * cardWidth + maxLevel * columnGap
  };
}

function comparePertNodes(
  firstId: string,
  secondId: string,
  nodesById: Map<string, PlanningIssueDTO>,
  riskByIssueId: Map<string, PertBottleneck>
) {
  const firstRisk = riskByIssueId.get(firstId)?.score ?? 0;
  const secondRisk = riskByIssueId.get(secondId)?.score ?? 0;
  if (firstRisk !== secondRisk) return secondRisk - firstRisk;

  const first = nodesById.get(firstId);
  const second = nodesById.get(secondId);
  return (first?.code ?? firstId).localeCompare(second?.code ?? secondId);
}

function getPertParentRowAverage(
  issueId: string,
  incoming: Map<string, Set<string>>,
  rowById: Map<string, number>
) {
  const parentRows = [...(incoming.get(issueId) ?? [])]
    .map((parentId) => rowById.get(parentId))
    .filter((row): row is number => row !== undefined);

  if (!parentRows.length) return Number.MAX_SAFE_INTEGER;
  return parentRows.reduce((sum, row) => sum + row, 0) / parentRows.length;
}

function PertDependencyGraph({
  helpers,
  layout,
  onOpenIssue
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  layout: PertGraphLayout;
  onOpenIssue: (issueId: string) => void;
}) {
  const nodeMap = React.useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node] as const)),
    [layout.nodes]
  );
  const canvasHeight = Math.max(layout.height, 620);

  return (
    <div className="max-h-[680px] overflow-auto rounded-md border bg-white shadow-inner dark:border-zinc-800 dark:bg-zinc-950">
      <div
        className="relative min-h-[620px]"
        data-pert-graph="true"
        style={{
          height: canvasHeight,
          width: layout.width,
          backgroundImage:
            "linear-gradient(to right, rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.22) 1px, transparent 1px)",
          backgroundSize: "22px 22px"
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-visible"
          height={canvasHeight}
          width={layout.width}
        >
          <defs>
            <marker
              id="pert-flow-arrow"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="rgb(124 58 237)" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const source = nodeMap.get(edge.sourceId);
            const target = nodeMap.get(edge.targetId);
            if (!source || !target) return null;

            const sourceX = source.x + layout.cardWidth;
            const sourceY = source.y + layout.cardHeight / 2;
            const targetX = target.x;
            const targetY = target.y + layout.cardHeight / 2;
            const midX = sourceX + Math.max((targetX - sourceX) / 2, 34);

            return (
              <path
                d={`M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`}
                fill="none"
                key={edge.id}
                markerEnd="url(#pert-flow-arrow)"
                stroke="rgb(124 58 237)"
                strokeDasharray={edge.isBlockingUntilDone ? undefined : "5 4"}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => (
          <PertGraphIssueCard
            helpers={helpers}
            issue={node.issue}
            isBottleneck={node.isBottleneck}
            key={node.id}
            onOpenIssue={onOpenIssue}
            riskLevel={node.riskLevel}
            riskScore={node.riskScore}
            style={{
              height: layout.cardHeight,
              left: node.x,
              top: node.y,
              width: layout.cardWidth
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PertGraphIssueCard({
  helpers,
  isBottleneck,
  issue,
  onOpenIssue,
  riskLevel,
  riskScore,
  style
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  isBottleneck: boolean;
  issue: PlanningIssueDTO;
  onOpenIssue: (issueId: string) => void;
  riskLevel?: PertBottleneck["riskLevel"];
  riskScore: number;
  style: React.CSSProperties;
}) {
  const metrics = helpers.getMetrics(issue);
  const statusText =
    isBottleneck && issue.status !== "DONE"
      ? "Pendiente/bloqueado"
      : statusLabels[issue.status];

  return (
    <button
      className={cn(
        "absolute z-20 flex flex-col justify-between rounded-lg border border-l-4 bg-slate-50 p-3 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-900",
        isBottleneck
          ? "border-red-400 border-l-red-500 bg-red-50/80 dark:border-red-500 dark:bg-red-950/30"
          : "border-slate-200 border-l-indigo-600 dark:border-zinc-800 dark:border-l-indigo-500",
        issue.status === "IN_PROGRESS" &&
          isBottleneck &&
          "bg-amber-50/90 dark:bg-amber-950/25"
      )}
      data-pert-node="true"
      onClick={() => onOpenIssue(issue.id)}
      style={style}
      title={`${issue.code} ${issue.title}`}
      type="button"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="ticket-code shrink-0 font-mono text-[11px] font-bold text-blue-700 dark:text-blue-300">
            {issue.code}
          </span>
          {isBottleneck ? (
            <span
              className="shrink-0 rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-[9px] font-bold uppercase leading-none text-red-700"
              title={`Cuello de botella: ${riskLevel ?? "Riesgo"} (${riskScore})`}
            >
              Cuello de botella
            </span>
          ) : null}
        </div>
        <div className="min-h-[30px] text-[12px] font-bold leading-snug text-slate-950 dark:text-zinc-50">
          {issue.title}
        </div>
        <div className="text-[11px] font-medium leading-snug text-slate-600 dark:text-zinc-300">
          {issue.assignee.name}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span
          className={cn(
            "min-w-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase leading-none",
            isBottleneck && issue.status !== "DONE"
              ? "bg-red-100 text-red-700"
              : statusBadgeClasses[issue.status]
          )}
        >
          {statusText}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
          {formatCompactMinutes(metrics.estimate)}
        </span>
      </div>
    </button>
  );
}

function PertDependencyRow({
  helpers,
  link,
  onOpenIssue
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  link: ReturnType<typeof buildDependencyLinks>[number];
  onOpenIssue: (issueId: string) => void;
}) {
  const isBlockedBy = link.relation === "is_blocked_by";
  const leftIssue = isBlockedBy ? link.to : link.from;
  const rightIssue = isBlockedBy ? link.from : link.to;
  const leftTitle = isBlockedBy ? "Tarea bloqueante" : "Origen: bloquea";
  const rightTitle = isBlockedBy
    ? link.isBlockingUntilDone
      ? "Bloqueada hasta finalizar"
      : "Está bloqueada por esta tarea"
    : link.isBlockingUntilDone
      ? "Bloqueada hasta finalizar"
      : "Destino relacionado";

  return (
    <div className="mb-3 grid gap-3 rounded-md border bg-background p-3 last:mb-0 xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] xl:items-center">
      <PertIssueCard
        helpers={helpers}
        issue={helpers.issueMap.get(leftIssue.id) ?? leftIssue}
        onOpenIssue={onOpenIssue}
        title={leftTitle}
      />
      <PertRelationConnector
        isBlockingUntilDone={link.isBlockingUntilDone}
        relation={link.relation}
      />
      <PertIssueCard
        helpers={helpers}
        issue={helpers.issueMap.get(rightIssue.id) ?? rightIssue}
        onOpenIssue={onOpenIssue}
        title={rightTitle}
      />
    </div>
  );
}

function PertRelationConnector({
  isBlockingUntilDone,
  relation
}: {
  isBlockingUntilDone: boolean;
  relation: ReturnType<typeof buildDependencyLinks>[number]["relation"];
}) {
  const isBlockedBy = relation === "is_blocked_by";
  const stroke = "rgb(124 58 237)";
  const path = "M 164 42 C 118 42, 82 42, 16 42";

  return (
    <div className="rounded-md border bg-muted/30 px-2 py-3 text-center">
      <div
        className={cn(
          "mb-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          isBlockedBy
            ? "border-violet-200 bg-violet-50 text-violet-800"
            : "border-blue-200 bg-blue-50 text-blue-800"
        )}
      >
        {getDependencyRelationLabel(relation)}
      </div>
      <svg
        aria-hidden="true"
        className="mx-auto h-14 w-full max-w-[180px]"
        viewBox="0 0 180 70"
      >
        <defs>
          <marker
            id="pert-arrow-is-blocked-by"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="rgb(124 58 237)" />
          </marker>
        </defs>
        <path
          d={path}
          fill="none"
          markerEnd="url(#pert-arrow-is-blocked-by)"
          stroke={stroke}
          strokeDasharray={isBlockingUntilDone ? undefined : "5 4"}
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle cx="164" cy="42" fill="white" r="4" stroke={stroke} />
        <circle cx="16" cy="42" fill={stroke} r="4" />
      </svg>
      <p className="text-[11px] text-muted-foreground">
        sale izquierda y entra derecha
      </p>
    </div>
  );
}

function getDependencyRelationLabel(relation: "blocks" | "is_blocked_by") {
  return relation === "blocks" ? "Bloquea" : "Está bloqueada por";
}

function ExecutiveView({
  helpers,
  issues,
  onOpenIssue
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  issues: PlanningIssueDTO[];
  onOpenIssue: (issueId: string) => void;
}) {
  const [showAccuracyInfo, setShowAccuracyInfo] = React.useState(false);
  const [showAccuracyDetails, setShowAccuracyDetails] = React.useState(false);
  const [showDailyInfo, setShowDailyInfo] = React.useState(false);
  const [showDailyDetails, setShowDailyDetails] = React.useState(false);
  const [showAgingInfo, setShowAgingInfo] = React.useState(false);
  const [selectedAgingBucket, setSelectedAgingBucket] = React.useState<string | null>(
    null
  );
  const [excludeDoneFromLoad, setExcludeDoneFromLoad] = React.useState(true);
  const [dailyPage, setDailyPage] = React.useState(1);
  const [expandedDailyRows, setExpandedDailyRows] = React.useState<Set<string>>(
    () => new Set()
  );
  const [accuracySort, setAccuracySort] = React.useState<
    SortState<AccuracySortKey>
  >({ key: "ratio", direction: "desc" });
  const [executiveDailySort, setExecutiveDailySort] = React.useState<
    SortState<ExecutiveDailySortKey>
  >({ key: "date", direction: "asc" });
  const [agingSort, setAgingSort] = React.useState<SortState<AgingSortKey>>({
    key: "code",
    direction: "asc"
  });
  const leafIssues = helpers
    .getLeafIssues()
    .filter((issue) => issues.some((visible) => visible.id === issue.id));
  const totalEstimate = leafIssues.reduce(
    (sum, issue) => sum + helpers.getMetrics(issue).estimate,
    0
  );
  const totalSpent = leafIssues.reduce(
    (sum, issue) => sum + helpers.getMetrics(issue).timeSpent,
    0
  );
  const doneCount = issues.filter((issue) => issue.status === "DONE").length;
  const progress = issues.length ? Math.round((doneCount / issues.length) * 100) : 0;
  const accuracy = totalEstimate
    ? Math.round((totalSpent / totalEstimate) * 100)
    : 0;
  const dailyLoad = buildDailyLoad(issues, helpers, {
    excludeDone: excludeDoneFromLoad
  });
  const resourceLoad = getExecutiveResourceLoad(dailyLoad);
  const dailyLoadIndex = getDailyResourceLoadIndex(dailyLoad);
  const dailyLoadRows = React.useMemo(
    () => buildDailyLoadExecutiveRows(dailyLoad),
    [dailyLoad]
  );
  const sortedDailyLoadRows = React.useMemo(
    () =>
      sortByState(
        dailyLoadRows,
        executiveDailySort,
        getExecutiveDailySortValue
      ),
    [dailyLoadRows, executiveDailySort]
  );
  const dailyPagination = paginateRows(sortedDailyLoadRows, dailyPage, 8);
  const dailyHeatmap = React.useMemo(
    () => buildDailyLoadHeatmap(dailyLoadRows),
    [dailyLoadRows]
  );
  const agingBuckets = getAgingBuckets(issues, helpers);
  const agingDetailRows = agingBuckets.flatMap((bucket) =>
    bucket.items.map((issue) => ({ bucket: bucket.label, issue }))
  );
  const selectedAgingBucketData =
    agingBuckets.find((bucket) => bucket.label === selectedAgingBucket) ?? null;
  const selectedAgingRows = React.useMemo(
    () =>
      sortByState(
        selectedAgingBucketData?.items ?? [],
        agingSort,
        getAgingSortValue
      ),
    [agingSort, selectedAgingBucketData]
  );
  const accuracyRows = sortByState(
    leafIssues
    .filter((issue) => helpers.getMetrics(issue).estimate > 0)
    .map((issue) => {
      const metrics = helpers.getMetrics(issue);
      return {
        issue,
        ratio: Math.round((metrics.timeSpent / metrics.estimate) * 100),
        estimate: metrics.estimate,
        spent: metrics.timeSpent
      };
    }),
    accuracySort,
    getAccuracySortValue
  ).slice(0, 6);

  React.useEffect(() => {
    setDailyPage(1);
    setExpandedDailyRows(new Set());
  }, [excludeDoneFromLoad, issues]);

  React.useEffect(() => {
    if (
      selectedAgingBucket &&
      !agingBuckets.some((bucket) => bucket.label === selectedAgingBucket)
    ) {
      setSelectedAgingBucket(null);
    }
  }, [agingBuckets, selectedAgingBucket]);

  function exportExecutiveSummary() {
    downloadCsv("tablero-ejecutivo.csv", [
      ["Indicador", "Valor", "Detalle"],
      [
        "Precision de estimacion",
        `${accuracy}%`,
        `${formatHoursFromMinutes(totalSpent)} / ${formatHoursFromMinutes(totalEstimate)}`
      ],
      [
        "Daily Resource Load Index",
        `${dailyLoadIndex}%`,
        `${resourceLoad.resources} recursos / ${resourceLoad.days} dias`
      ],
      ["Sobrecargados", resourceLoad.overloaded, ""],
      ["Saludables", resourceLoad.healthy, ""],
      ["Con capacidad libre", resourceLoad.available, ""],
      ...agingBuckets.map((bucket) => [
        `Envejecimiento ${bucket.label}`,
        bucket.items.length,
        ""
      ])
    ]);
  }

  function exportDailyResourceLoad() {
    downloadCsv("daily-resource-load-index.csv", [
      [
        "Responsable",
        "Fecha",
        "Horas asignadas",
        "Utilizacion",
        "Estado",
        "Tickets",
        "Detalle"
      ],
      ...dailyLoadRows.map((row) => [
        row.assignee,
        formatDateLong(row.date),
        formatHoursFromMinutes(row.minutes),
        `${row.utilization}%`,
        row.loadStatus,
        row.issues.length,
        row.issues.map((issue) => `${issue.code} ${issue.title}`).join(" | ")
      ])
    ]);
  }

  function exportAccuracyDetails() {
    downloadCsv("precision-estimacion.csv", [
      [
        "Codigo",
        "Titulo",
        "Responsable",
        "Estimacion original",
        "Tiempo consumido",
        "Restante",
        "Precision"
      ],
      ...accuracyRows.map((row) => {
        const metrics = helpers.getMetrics(row.issue);
        return [
          row.issue.code,
          row.issue.title,
          row.issue.assignee.name,
          formatHoursFromMinutes(row.estimate),
          formatHoursFromMinutes(row.spent),
          formatHoursFromMinutes(metrics.timeRemaining),
          `${row.ratio}%`
        ];
      })
    ]);
  }

  function exportAgingBuckets() {
    downloadCsv("cubos-envejecimiento.csv", [
      ["Cubo", "Codigo", "Titulo", "Responsable", "Estado", "Inicio"],
      ...agingDetailRows.map((row) => {
        const metrics = helpers.getMetrics(row.issue);
        return [
          row.bucket,
          row.issue.code,
          row.issue.title,
          row.issue.assignee.name,
          statusLabels[row.issue.status],
          formatDateLong(metrics.startDate)
        ];
      })
    ]);
  }

  function toggleDailyRow(rowId: string) {
    setExpandedDailyRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Panel ejecutivo
          </p>
          <h1 className="mt-1 text-base font-bold tracking-tight">
            Tablero ejecutivo Jira
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Indicadores estrategicos para confiabilidad, precision de estimacion
            y envejecimiento del trabajo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border bg-background px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
            {issues.length} tickets analizados
          </span>
          <ExecutiveIconButton
            label="Exportar resumen ejecutivo"
            onClick={exportExecutiveSummary}
          >
            <Download />
          </ExecutiveIconButton>
        </div>
      </div>

      <div className="grid min-h-40 place-items-center py-8 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">Carga inicial</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Datos del proyecto actual listos para calcular los KPIs ejecutivos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExecutivePanelCard>
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Precision de estimacion
            </p>
            <div className="flex items-center gap-2">
              <ExecutiveIconButton
                label="Exportar precision de estimacion"
                onClick={exportAccuracyDetails}
              >
                <Download />
              </ExecutiveIconButton>
              <ExecutiveIconButton
                label="Ver detalle de precision de estimacion"
                onClick={() => setShowAccuracyDetails((current) => !current)}
              >
                <Plus
                  className={cn(
                    "transition-transform",
                    showAccuracyDetails && "rotate-45"
                  )}
                />
              </ExecutiveIconButton>
              <ExecutiveIconButton
                label="Informacion de precision de estimacion"
                onClick={() => setShowAccuracyInfo((current) => !current)}
              >
                <Info />
              </ExecutiveIconButton>
            </div>
          </div>

          <div className="mt-8 text-4xl font-semibold tracking-tight">
            {accuracy}%
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            {formatHoursFromMinutes(totalSpent)} /{" "}
            {formatHoursFromMinutes(totalEstimate)}
          </p>

          {showAccuracyInfo ? (
            <p className="mt-4 rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
              Compara el tiempo consumido contra la estimacion original de las
              tareas y subtareas visibles.
            </p>
          ) : null}

          {showAccuracyDetails ? (
            <div className="mt-4 grid gap-2">
              {accuracyRows.length ? (
                <>
                  <div className="grid grid-cols-[84px_minmax(0,1fr)_72px] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <SortableGridHeader
                      label="Codigo"
                      onSortChange={setAccuracySort}
                      sortKey="code"
                      sortState={accuracySort}
                    />
                    <SortableGridHeader
                      label="Titulo"
                      onSortChange={setAccuracySort}
                      sortKey="title"
                      sortState={accuracySort}
                    />
                    <SortableGridHeader
                      align="right"
                      label="Precision"
                      onSortChange={setAccuracySort}
                      sortKey="ratio"
                      sortState={accuracySort}
                    />
                  </div>
                  {accuracyRows.map((row) => (
                    <div
                      className="grid grid-cols-[84px_minmax(0,1fr)_72px] gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                      key={row.issue.id}
                    >
                      <span className="ticket-code font-mono font-semibold text-primary">
                        {row.issue.code}
                      </span>
                      <span className="truncate">{row.issue.title}</span>
                      <span className="text-right font-semibold">{row.ratio}%</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No hay tareas con estimacion original para detallar.
                </p>
              )}
            </div>
          ) : null}
        </ExecutivePanelCard>

        <ExecutivePanelCard>
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Daily Resource Load Index
            </p>
            <div className="flex items-center gap-2">
              <ExecutiveIconButton
                label="Exportar Daily Resource Load Index"
                onClick={exportDailyResourceLoad}
              >
                <Download />
              </ExecutiveIconButton>
              <ExecutiveIconButton
                label="Ver detalle de carga diaria de recursos"
                onClick={() => setShowDailyDetails((current) => !current)}
              >
                <Plus
                  className={cn(
                    "transition-transform",
                    showDailyDetails && "rotate-45"
                  )}
                />
              </ExecutiveIconButton>
              <ExecutiveIconButton
                label="Informacion de Daily Resource Load Index"
                onClick={() => setShowDailyInfo((current) => !current)}
              >
                <Info />
              </ExecutiveIconButton>
            </div>
          </div>

          <div className="mt-3 text-4xl font-semibold tracking-tight">
            {dailyLoadIndex}%
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {resourceLoad.resources} recursos / {resourceLoad.days} dias
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <ExecutiveSmallMetric
              label="sobrecargados"
              value={resourceLoad.overloaded}
            />
            <ExecutiveSmallMetric label="saludables" value={resourceLoad.healthy} />
            <ExecutiveSmallMetric
              label="con capacidad libre"
              value={resourceLoad.available}
            />
          </div>

          <label className="mt-4 inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
            <input
              checked={excludeDoneFromLoad}
              className="size-4 accent-primary"
              onChange={(event) => setExcludeDoneFromLoad(event.target.checked)}
              type="checkbox"
            />
            Excluir finalizadas
          </label>

          {showDailyInfo ? (
            <p className="mt-4 rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
              Distribuye la estimacion original de tareas y subtareas entre los
              dias laborales, de lunes a viernes, y compara la carga diaria por
              persona contra una jornada estandar de 8 horas.
            </p>
          ) : null}
        </ExecutivePanelCard>
      </div>

      <ExecutivePanelCard className="mt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold">Daily Resource Load Index</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Heatmap y tabla ejecutiva de utilizacion diaria por persona.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExecutiveIconButton
              label="Exportar Daily Resource Load Index"
              onClick={exportDailyResourceLoad}
            >
              <Download />
            </ExecutiveIconButton>
            <ExecutiveIconButton
              label="Mostrar u ocultar tabla ejecutiva"
              onClick={() => setShowDailyDetails((current) => !current)}
            >
              <Plus
                className={cn(
                  "transition-transform",
                  showDailyDetails && "rotate-45"
                )}
              />
            </ExecutiveIconButton>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-md border">
          {dailyHeatmap.assignees.length && dailyHeatmap.dates.length ? (
            <div
              className="grid min-w-max"
              style={{
                gridTemplateColumns: `180px repeat(${dailyHeatmap.dates.length}, 76px)`
              }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r bg-muted/80 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Recurso
              </div>
              {dailyHeatmap.dates.map((date) => (
                <div
                  className="sticky top-0 z-10 border-b border-r bg-muted/80 px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                  key={date}
                >
                  {formatDateShort(date)}
                </div>
              ))}

              {dailyHeatmap.assignees.map((assignee) => (
                <React.Fragment key={assignee}>
                  <div className="sticky left-0 z-10 truncate border-b border-r bg-background px-3 py-3 text-sm font-medium">
                    {assignee}
                  </div>
                  {dailyHeatmap.dates.map((date) => {
                    const row = dailyHeatmap.cells.get(`${assignee}:${date}`);
                    return (
                      <button
                        className={cn(
                          "min-h-14 border-b border-r px-2 py-2 text-center text-xs transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          getDailyLoadTone(row?.utilization ?? 0)
                        )}
                        disabled={!row}
                        key={`${assignee}-${date}`}
                        onClick={() => row && toggleDailyRow(row.id)}
                        title={
                          row
                            ? `${assignee}\n${formatDateLong(date)}\n${formatHoursFromMinutes(row.minutes)}\n${row.utilization}%`
                            : `${assignee}\n${formatDateLong(date)}\nSin carga`
                        }
                        type="button"
                      >
                        {row ? (
                          <>
                            <span className="block font-bold">
                              {row.utilization}%
                            </span>
                            <span className="block opacity-80">
                              {formatHoursFromMinutes(row.minutes)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <EmptyPanel title="No hay datos suficientes para el heatmap" />
          )}
        </div>

        {showDailyDetails ? (
          <div className="mt-4 rounded-md border">
            <div className="grid grid-cols-[minmax(0,1fr)_110px_96px_96px_120px_92px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <SortableGridHeader
                label="Responsable"
                onSortChange={setExecutiveDailySort}
                sortKey="assignee"
                sortState={executiveDailySort}
              />
              <SortableGridHeader
                label="Fecha"
                onSortChange={setExecutiveDailySort}
                sortKey="date"
                sortState={executiveDailySort}
              />
              <SortableGridHeader
                label="Horas"
                onSortChange={setExecutiveDailySort}
                sortKey="minutes"
                sortState={executiveDailySort}
              />
              <SortableGridHeader
                label="Uso"
                onSortChange={setExecutiveDailySort}
                sortKey="utilization"
                sortState={executiveDailySort}
              />
              <SortableGridHeader
                label="Estado"
                onSortChange={setExecutiveDailySort}
                sortKey="status"
                sortState={executiveDailySort}
              />
              <SortableGridHeader
                label="Tickets"
                onSortChange={setExecutiveDailySort}
                sortKey="tickets"
                sortState={executiveDailySort}
              />
            </div>

            {dailyPagination.rows.length ? (
              dailyPagination.rows.map((row) => (
                <div key={row.id}>
                  <button
                    className="grid w-full grid-cols-[minmax(0,1fr)_110px_96px_96px_120px_92px] gap-2 border-b px-3 py-2 text-left text-sm transition hover:bg-accent/40"
                    onClick={() => toggleDailyRow(row.id)}
                    type="button"
                  >
                    <span className="truncate font-medium">{row.assignee}</span>
                    <span>{formatDateShort(row.date)}</span>
                    <span>{formatHoursFromMinutes(row.minutes)}</span>
                    <span className={cn("font-semibold", getDailyLoadTextTone(row.utilization))}>
                      {row.utilization}%
                    </span>
                    <span>{row.loadStatus}</span>
                    <span>{row.issues.length}</span>
                  </button>

                  {expandedDailyRows.has(row.id) ? (
                    <ExecutiveDailyIssuesDetails
                      helpers={helpers}
                      issues={row.issues}
                      onOpenIssue={onOpenIssue}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                No hay registros para la tabla ejecutiva.
              </p>
            )}

            <ExecutivePager
              page={dailyPagination.page}
              totalPages={dailyPagination.totalPages}
              onPageChange={setDailyPage}
            />
          </div>
        ) : null}
      </ExecutivePanelCard>

      <ExecutivePanelCard className="mt-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold">Cubos de envejecimiento</h2>
          <div className="flex items-center gap-2">
            <ExecutiveIconButton
              label="Exportar cubos de envejecimiento"
              onClick={exportAgingBuckets}
            >
              <Download />
            </ExecutiveIconButton>
            <ExecutiveIconButton
              label="Informacion de cubos de envejecimiento"
              onClick={() => setShowAgingInfo((current) => !current)}
            >
              <Info />
            </ExecutiveIconButton>
          </div>
        </div>

        {showAgingInfo ? (
          <p className="mt-3 rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
            Se calcula con tareas abiertas usando la fecha de inicio frente a la
            fecha actual.
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {agingBuckets.map((bucket) => {
            const isSelected = selectedAgingBucket === bucket.label;

            return (
            <button
              aria-expanded={isSelected}
              className={cn(
                "grid min-h-28 place-items-center rounded-lg border bg-muted/20 p-4 text-center transition hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && "border-primary bg-primary/5 shadow-sm"
              )}
              key={bucket.label}
              onClick={() =>
                setSelectedAgingBucket((current) =>
                  current === bucket.label ? null : bucket.label
                )
              }
              type="button"
            >
              <div>
                <div className="text-4xl font-semibold tracking-tight">
                  {bucket.items.length}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatAgingBucketLabel(bucket.label)}
                </p>
              </div>
            </button>
          );
          })}
        </div>

        {selectedAgingBucketData ? (
          <div className="mt-4 max-h-80 overflow-auto rounded-md border">
            {selectedAgingRows.length ? (
              <>
                <div className="sticky top-0 z-10 grid grid-cols-[86px_minmax(0,1fr)_140px] gap-2 border-b bg-background px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <SortableGridHeader
                    label="Codigo"
                    onSortChange={setAgingSort}
                    sortKey="code"
                    sortState={agingSort}
                  />
                  <SortableGridHeader
                    label="Titulo"
                    onSortChange={setAgingSort}
                    sortKey="title"
                    sortState={agingSort}
                  />
                  <SortableGridHeader
                    label="Responsable"
                    onSortChange={setAgingSort}
                    sortKey="assignee"
                    sortState={agingSort}
                  />
                </div>
                {selectedAgingRows.slice(0, 80).map((issue) => (
                  <button
                    className="grid w-full grid-cols-[86px_minmax(0,1fr)_140px] gap-2 border-b px-3 py-2 text-left text-xs transition hover:bg-accent/40 last:border-b-0"
                    key={`${selectedAgingBucketData.label}-${issue.id}`}
                    onClick={() => onOpenIssue(issue.id)}
                    type="button"
                  >
                    <span className="ticket-code font-mono font-semibold text-primary">
                      {issue.code}
                    </span>
                    <span className="truncate">{issue.title}</span>
                    <span className="truncate text-muted-foreground">
                      {issue.assignee.name}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                No hay tareas abiertas en este cubo.
              </p>
            )}
          </div>
        ) : null}
      </ExecutivePanelCard>
    </section>
  );
}

const WORKDAY_LIMIT = 8 * 60;

type AccuracyRow = {
  estimate: number;
  issue: PlanningIssueDTO;
  ratio: number;
  spent: number;
};

type DailyLoadExecutiveRow = {
  id: string;
  assignee: string;
  date: string;
  minutes: number;
  utilization: number;
  loadStatus: string;
  issues: PlanningIssueDTO[];
};

function getAccuracySortValue(
  row: AccuracyRow,
  key: AccuracySortKey
): SortableValue {
  if (key === "code") return row.issue.code;
  if (key === "title") return row.issue.title;
  return row.ratio;
}

function getExecutiveDailySortValue(
  row: DailyLoadExecutiveRow,
  key: ExecutiveDailySortKey
): SortableValue {
  if (key === "assignee") return row.assignee;
  if (key === "date") return row.date;
  if (key === "minutes") return row.minutes;
  if (key === "utilization") return row.utilization;
  if (key === "status") return row.loadStatus;
  return row.issues.length;
}

function getExecutiveIssueSortValue(
  issue: PlanningIssueDTO,
  key: ExecutiveIssueSortKey,
  helpers: ReturnType<typeof createIssueHelpers>
): SortableValue {
  const metrics = helpers.getMetrics(issue);
  if (key === "code") return issue.code;
  if (key === "title") return issue.title;
  if (key === "sprint") return issue.sprint?.name ?? "Backlog";
  if (key === "estimate") return metrics.estimate;
  return metrics.timeRemaining;
}

function getAgingSortValue(
  issue: PlanningIssueDTO,
  key: AgingSortKey
): SortableValue {
  if (key === "code") return issue.code;
  if (key === "title") return issue.title;
  return issue.assignee.name;
}

function getDailyResourceLoadIndex(
  dailyLoad: ReturnType<typeof buildDailyLoad>
) {
  if (!dailyLoad.length) return 0;
  const cappedUtilization = dailyLoad.reduce(
    (sum, cell) => sum + Math.min(cell.minutes / WORKDAY_LIMIT, 1.5),
    0
  );

  return Math.round((cappedUtilization / dailyLoad.length) * 100);
}

function buildDailyLoadExecutiveRows(
  dailyLoad: ReturnType<typeof buildDailyLoad>
): DailyLoadExecutiveRow[] {
  return dailyLoad.map((cell) => {
    const utilization = Math.round((cell.minutes / WORKDAY_LIMIT) * 100);

    return {
      id: `${cell.assignee}:${cell.date}`,
      assignee: cell.assignee,
      date: cell.date,
      minutes: cell.minutes,
      utilization,
      loadStatus: getDailyLoadStatus(utilization),
      issues: cell.issues
    };
  });
}

function buildDailyLoadHeatmap(rows: DailyLoadExecutiveRow[]) {
  const assignees = [...new Set(rows.map((row) => row.assignee))].sort((a, b) =>
    a.localeCompare(b)
  );
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const cells = new Map(rows.map((row) => [`${row.assignee}:${row.date}`, row]));

  return { assignees, dates, cells };
}

function ExecutiveDailyIssuesDetails({
  helpers,
  issues,
  onOpenIssue
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  issues: PlanningIssueDTO[];
  onOpenIssue: (issueId: string) => void;
}) {
  const [issueSort, setIssueSort] = React.useState<
    SortState<ExecutiveIssueSortKey>
  >({ key: "code", direction: "asc" });
  const sortedIssues = React.useMemo(
    () =>
      sortByState(issues, issueSort, (issue, key) =>
        getExecutiveIssueSortValue(issue, key, helpers)
      ),
    [helpers, issueSort, issues]
  );

  return (
    <div className="grid gap-2 border-b bg-muted/20 p-3">
      <div className="grid grid-cols-[86px_minmax(0,1fr)_140px_100px_100px] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <SortableGridHeader
          label="Codigo"
          onSortChange={setIssueSort}
          sortKey="code"
          sortState={issueSort}
        />
        <SortableGridHeader
          label="Titulo"
          onSortChange={setIssueSort}
          sortKey="title"
          sortState={issueSort}
        />
        <SortableGridHeader
          label="Sprint"
          onSortChange={setIssueSort}
          sortKey="sprint"
          sortState={issueSort}
        />
        <SortableGridHeader
          label="Estimacion"
          onSortChange={setIssueSort}
          sortKey="estimate"
          sortState={issueSort}
        />
        <SortableGridHeader
          label="Restante"
          onSortChange={setIssueSort}
          sortKey="remaining"
          sortState={issueSort}
        />
      </div>
      {sortedIssues.map((issue) => {
        const metrics = helpers.getMetrics(issue);

        return (
          <button
            className="grid grid-cols-[86px_minmax(0,1fr)_140px_100px_100px] gap-2 rounded-md border bg-background px-3 py-2 text-left text-xs transition hover:bg-accent/50"
            key={issue.id}
            onClick={() => onOpenIssue(issue.id)}
            type="button"
          >
            <span className="ticket-code font-mono font-semibold text-primary">
              {issue.code}
            </span>
            <span className="truncate">
              {issue.title}
              {issue.parentIssue ? (
                <span className="ml-2 text-muted-foreground">
                  Subtarea de{" "}
                  <span className="ticket-code font-mono">
                    {issue.parentIssue.code}
                  </span>
                </span>
              ) : null}
            </span>
            <span className="truncate text-muted-foreground">
              {issue.sprint?.name ?? "Backlog"}
            </span>
            <span>{formatHoursFromMinutes(metrics.estimate)}</span>
            <span>{formatHoursFromMinutes(metrics.timeRemaining)}</span>
          </button>
        );
      })}
    </div>
  );
}

function getDailyLoadStatus(utilization: number) {
  if (utilization > 100) return "Sobrecarga";
  if (utilization >= 80) return "Saludable";
  if (utilization > 0) return "Capacidad libre";
  return "Sin carga";
}

function getDailyLoadTone(utilization: number) {
  if (utilization > 120) return "border-red-200 bg-red-100 text-red-900";
  if (utilization > 100) return "border-orange-200 bg-orange-100 text-orange-900";
  if (utilization >= 80) return "border-emerald-200 bg-emerald-100 text-emerald-900";
  if (utilization > 0) return "border-sky-200 bg-sky-50 text-sky-900";
  return "bg-background text-muted-foreground";
}

function getDailyLoadTextTone(utilization: number) {
  if (utilization > 100) return "text-red-700";
  if (utilization >= 80) return "text-emerald-700";
  return "text-sky-700";
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    rows: rows.slice(start, start + pageSize),
    totalPages
  };
}

function ExecutivePager({
  onPageChange,
  page,
  totalPages
}: {
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
      <span>
        Pagina {page} de {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Anterior
        </Button>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

function ExecutivePanelCard({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-5 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function ExecutiveIconButton({
  children,
  label,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded-full border bg-background text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ExecutiveSmallMetric({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function getExecutiveResourceLoad(
  dailyLoad: ReturnType<typeof buildDailyLoad>
) {
  const dateCount = new Set(dailyLoad.map((cell) => cell.date)).size;
  const resourceMax = new Map<string, number>();

  for (const cell of dailyLoad) {
    resourceMax.set(
      cell.assignee,
      Math.max(resourceMax.get(cell.assignee) ?? 0, cell.minutes)
    );
  }

  let overloaded = 0;
  let healthy = 0;
  let available = 0;

  for (const minutes of resourceMax.values()) {
    const utilization = minutes / WORKDAY_LIMIT;
    if (utilization > 1) {
      overloaded += 1;
    } else if (utilization >= 0.8) {
      healthy += 1;
    } else {
      available += 1;
    }
  }

  return {
    resources: resourceMax.size,
    days: dateCount,
    overloaded,
    healthy,
    available
  };
}

function formatAgingBucketLabel(label: string) {
  if (label.startsWith("0-7")) return "0-7 dias Normal";
  if (label.startsWith("8-30")) return "7-30 dias Atencion";
  return ">30 dias Riesgo";
}

function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PertIssueCard({
  helpers,
  issue,
  onOpenIssue,
  title
}: {
  helpers: ReturnType<typeof createIssueHelpers>;
  issue: PlanningIssueDTO | { id: string; code: string; title: string; status: IssueStatus; estimate?: number | null; assignee: { name: string } };
  onOpenIssue: (issueId: string) => void;
  title: string;
}) {
  const fullIssue = helpers.issueMap.get(issue.id);
  const metrics = fullIssue
    ? helpers.getMetrics(fullIssue)
    : {
        estimate: issue.estimate ?? 0,
        isOverdue: false
      };

  return (
    <button
      className="min-w-0 rounded-md border bg-background p-3 text-left transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpenIssue(issue.id)}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span
          className={cn(
            "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
            statusBadgeClasses[issue.status]
          )}
        >
          {statusLabels[issue.status]}
        </span>
      </div>
      <div className="ticket-code mt-2 font-mono text-xs font-semibold text-primary">
        {issue.code}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{issue.title}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{issue.assignee.name}</span>
        <span>{formatMinutes(metrics.estimate)}</span>
      </div>
    </button>
  );
}

function MetricCard({
  helper,
  icon: Icon,
  label,
  value
}: {
  helper?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4">
        <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="truncate text-lg font-semibold">{value}</div>
          {helper ? (
            <p className="truncate text-xs text-muted-foreground">{helper}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {title}
    </div>
  );
}
