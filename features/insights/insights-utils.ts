import type { IssueStatus, IssueSummaryDTO } from "@/lib/types";
import { formatJiraEstimate } from "@/lib/time-estimate";

import type { PlanningIssueDTO } from "./insights-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WORKDAY_MINUTES = 8 * 60;

export const statusLabels: Record<IssueStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  DONE: "Finalizada"
};

export const statusBadgeClasses: Record<IssueStatus, string> = {
  TODO: "border-zinc-200 bg-zinc-100 text-zinc-700",
  IN_PROGRESS: "border-amber-200 bg-amber-100 text-amber-800",
  DONE: "border-emerald-200 bg-emerald-100 text-emerald-800"
};

export const statusBarClasses: Record<IssueStatus, string> = {
  TODO: "bg-zinc-500",
  IN_PROGRESS: "bg-amber-500",
  DONE: "bg-emerald-600"
};

export type InsightFilters = {
  query: string;
  assigneeIds: string[];
  status: IssueStatus | "ALL";
  sprintIds: string[];
  epicIds: string[];
  showSubtasks: boolean;
};

export type IssueMetrics = {
  startDate: Date | null;
  dueDate: Date | null;
  estimate: number;
  timeSpent: number;
  timeRemaining: number;
  childCount: number;
  hasChildren: boolean;
  progress: number;
  durationDays: number;
  isOverdue: boolean;
};

export type IssueHelpers = {
  issueMap: Map<string, PlanningIssueDTO>;
  childrenByParent: Map<string, PlanningIssueDTO[]>;
  getChildren: (issue: PlanningIssueDTO) => PlanningIssueDTO[];
  getMetrics: (issue: PlanningIssueDTO) => IssueMetrics;
  getLeafIssues: () => PlanningIssueDTO[];
};

export type IssueGroup = {
  id: string;
  title: string;
  subtitle?: string;
  issues: PlanningIssueDTO[];
};

export type DependencyRelation = "blocks" | "is_blocked_by";

export type DependencyLinkMode = DependencyRelation | "both";

export type DependencyLink = {
  id: string;
  relation: DependencyRelation;
  from: PlanningIssueDTO | IssueSummaryDTO;
  to: PlanningIssueDTO | IssueSummaryDTO;
  isBlockingUntilDone: boolean;
  originalBlockerIssueId: string;
  originalBlockedIssueId: string;
};

export function createIssueHelpers(issues: PlanningIssueDTO[]): IssueHelpers {
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const childrenByParent = new Map<string, PlanningIssueDTO[]>();
  const metricsCache = new Map<string, IssueMetrics>();

  for (const issue of issues) {
    if (!issue.parentIssueId) continue;
    const current = childrenByParent.get(issue.parentIssueId) ?? [];
    current.push(issue);
    childrenByParent.set(issue.parentIssueId, current);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));
  }

  function getChildren(issue: PlanningIssueDTO) {
    return childrenByParent.get(issue.id) ?? [];
  }

  function getMetrics(issue: PlanningIssueDTO): IssueMetrics {
    const cached = metricsCache.get(issue.id);
    if (cached) return cached;

    const children = getChildren(issue);
    const directStart = parseDate(issue.startDate);
    const directDue = parseDate(issue.dueDate);

    let metrics: IssueMetrics;

    if (children.length) {
      const childMetrics = children.map(getMetrics);
      const estimate = childMetrics.reduce((sum, child) => sum + child.estimate, 0);
      const timeSpent = childMetrics.reduce((sum, child) => sum + child.timeSpent, 0);
      const startDate = earliestDate(childMetrics.map((child) => child.startDate)) ?? directStart;
      const dueDate = latestDate(childMetrics.map((child) => child.dueDate)) ?? directDue;
      const doneChildren = children.filter((child) => child.status === "DONE").length;

      metrics = {
        startDate,
        dueDate,
        estimate,
        timeSpent,
        timeRemaining: Math.max(estimate - timeSpent, 0),
        childCount: childMetrics.reduce(
          (sum, child) => sum + child.childCount,
          children.length
        ),
        hasChildren: true,
        progress: children.length ? Math.round((doneChildren / children.length) * 100) : 0,
        durationDays: getDurationDays(startDate, dueDate),
        isOverdue: isOverdue(dueDate, issue.status)
      };
    } else {
      const estimate = issue.estimate ?? 0;
      const timeRemaining = issue.timeRemaining ?? Math.max(estimate - issue.timeSpent, 0);

      metrics = {
        startDate: directStart,
        dueDate: directDue,
        estimate,
        timeSpent: issue.timeSpent ?? 0,
        timeRemaining,
        childCount: 0,
        hasChildren: false,
        progress: getStatusProgress(issue.status),
        durationDays: getDurationDays(directStart, directDue),
        isOverdue: isOverdue(directDue, issue.status)
      };
    }

    metricsCache.set(issue.id, metrics);
    return metrics;
  }

  function getLeafIssues() {
    return issues.filter((issue) => !getChildren(issue).length);
  }

  return {
    issueMap,
    childrenByParent,
    getChildren,
    getMetrics,
    getLeafIssues
  };
}

export function filterIssues(
  issues: PlanningIssueDTO[],
  helpers: IssueHelpers,
  filters: InsightFilters
) {
  const query = normalizeText(filters.query);

  return issues.filter((issue) => {
    if (!filters.showSubtasks && issue.parentIssueId) return false;
    if (filters.assigneeIds.length && !filters.assigneeIds.includes(issue.assigneeId)) {
      return false;
    }
    if (filters.status !== "ALL" && issue.status !== filters.status) return false;
    if (filters.sprintIds.length) {
      const matchesSprint = filters.sprintIds.some((sprintId) =>
        sprintId === "BACKLOG" ? !issue.sprintId : issue.sprintId === sprintId
      );
      if (!matchesSprint) return false;
    }
    if (filters.epicIds.length) {
      if (!issue.epicId || !filters.epicIds.includes(issue.epicId)) {
        return false;
      }
    }

    if (!query) return true;

    const parent = issue.parentIssueId ? helpers.issueMap.get(issue.parentIssueId) : null;
    const haystack = normalizeText(
      [
        issue.code,
        issue.title,
        issue.assignee.name,
        issue.epic?.name,
        issue.sprint?.name,
        parent?.code,
        parent?.title
      ]
        .filter(Boolean)
        .join(" ")
    );

    return haystack.includes(query);
  });
}

export function getTimelineBounds(issues: PlanningIssueDTO[], helpers: IssueHelpers) {
  const dates = issues.flatMap((issue) => {
    const metrics = helpers.getMetrics(issue);
    return [metrics.startDate, metrics.dueDate].filter(
      (date): date is Date => Boolean(date)
    );
  });

  const today = stripTime(new Date());
  const first = earliestDate(dates) ?? today;
  const last = latestDate(dates) ?? addDays(today, 14);

  return {
    start: addDays(first, -2),
    end: addDays(last, 2)
  };
}

export function groupIssuesByAssignee(normalizedIssues: PlanningIssueDTO[]) {
  const groups = new Map<string, IssueGroup>();

  for (const issue of normalizedIssues) {
    const groupId = issue.assigneeId;
    const current =
      groups.get(groupId) ??
      {
        id: groupId,
        title: issue.assignee.name || "Sin responsable",
        subtitle: issue.assignee.email,
        issues: []
      };

    current.issues.push(issue);
    groups.set(groupId, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      issues: sortGanttIssues(group.issues)
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function groupIssuesByPrincipal(
  normalizedIssues: PlanningIssueDTO[],
  helpers: IssueHelpers
) {
  const groups = new Map<string, IssueGroup>();

  for (const issue of normalizedIssues) {
    const principal = getPrincipalIssue(issue, helpers);
    const groupId = principal?.id ?? issue.epicId ?? "without-principal";
    const current =
      groups.get(groupId) ??
      {
        id: groupId,
        title: principal
          ? `${principal.code} ${principal.title}`
          : issue.epic?.name ?? "Sin principal",
        subtitle: principal ? "Tarea principal" : issue.epic?.key ?? undefined,
        issues: []
      };

    current.issues.push(issue);
    groups.set(groupId, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      issues: sortGanttIssues(group.issues)
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function buildTimelineDays(start: Date, end: Date) {
  const days: Date[] = [];
  let cursor = stripTime(start);
  const last = stripTime(end);

  while (cursor <= last) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getDayOffset(date: Date | null, timelineStart: Date) {
  if (!date) return 0;
  return Math.max(0, diffDays(stripTime(timelineStart), stripTime(date)));
}

export function getDurationDays(startDate: Date | null, dueDate: Date | null) {
  if (!startDate || !dueDate) return 1;
  return Math.max(1, diffDays(stripTime(startDate), stripTime(dueDate)) + 1);
}

export function buildDependencyLinks(
  issues: PlanningIssueDTO[],
  mode: DependencyLinkMode = "blocks"
) {
  const visibleIds = new Set(issues.map((issue) => issue.id));
  const links: DependencyLink[] = [];

  for (const issue of issues) {
    for (const blocker of issue.blockers) {
      if (!visibleIds.has(blocker.blockerIssueId)) continue;

      if (mode === "blocks" || mode === "both") {
        links.push({
          id: `${blocker.id}:blocks`,
          relation: "blocks",
          from: blocker.blockerIssue,
          to: issue,
          isBlockingUntilDone: blocker.isBlockingUntilDone,
          originalBlockerIssueId: blocker.blockerIssueId,
          originalBlockedIssueId: blocker.blockedIssueId
        });
      }

      if (mode === "is_blocked_by" || mode === "both") {
        links.push({
          id: `${blocker.id}:is-blocked-by`,
          relation: "is_blocked_by",
          from: issue,
          to: blocker.blockerIssue,
          isBlockingUntilDone: blocker.isBlockingUntilDone,
          originalBlockerIssueId: blocker.blockerIssueId,
          originalBlockedIssueId: blocker.blockedIssueId
        });
      }
    }
  }

  return links;
}

export function getBottlenecks(issues: PlanningIssueDTO[], helpers: IssueHelpers) {
  const visibleIds = new Set(issues.map((issue) => issue.id));
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const downstreamCache = new Map<
    string,
    { count: number; estimate: number; ids: Set<string> }
  >();
  const visibleOutgoing = new Map<string, string[]>();

  for (const issue of issues) {
    visibleOutgoing.set(
      issue.id,
      issue.blockingLinks
        .filter((link) => visibleIds.has(link.blockedIssueId))
        .map((link) => link.blockedIssueId)
    );
  }

  function getDownstream(issueId: string, visited = new Set<string>()) {
    const cached = downstreamCache.get(issueId);
    if (cached && !visited.size) return cached;

    const ids = new Set<string>();
    let estimate = 0;

    for (const childId of visibleOutgoing.get(issueId) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      ids.add(childId);

      const childIssue = issueById.get(childId);
      if (childIssue) {
        estimate += helpers.getMetrics(childIssue).estimate;
      }

      const nested = getDownstream(childId, visited);
      nested.ids.forEach((id) => ids.add(id));
      estimate += nested.estimate;
    }

    const result = { count: ids.size, estimate, ids };
    if (!visited.size) downstreamCache.set(issueId, result);
    return result;
  }

  return issues
    .map((issue) => {
      const metrics = helpers.getMetrics(issue);
      const blockingCount = issue.blockingLinks.filter((link) =>
        visibleIds.has(link.blockedIssueId)
      ).length;
      const blockedByCount = issue.blockers.filter((blocker) =>
        visibleIds.has(blocker.blockerIssueId)
      ).length;
      const downstream = getDownstream(issue.id);
      const isBlocked = blockedByCount > 0 && issue.status !== "DONE";
      const dueSoon = isDueSoon(metrics.dueDate, issue.status);
      const pendingWeight =
        issue.status === "TODO" ? 2 : issue.status === "IN_PROGRESS" ? 1 : 0;
      const downstreamWorkWeight = Math.min(
        8,
        Math.ceil(downstream.estimate / WORKDAY_MINUTES)
      );
      const doneAdjustment = issue.status === "DONE" ? -4 : 0;
      const score = Math.max(
        0,
        blockingCount * 4 +
          blockedByCount * 2 +
          downstream.count * 2 +
          downstreamWorkWeight +
          (isBlocked ? 3 : 0) +
          pendingWeight +
          (metrics.isOverdue ? 5 : dueSoon ? 3 : 0) +
          doneAdjustment
      );

      return {
        issue,
        score,
        blockingCount,
        blockedByCount,
        downstreamCount: downstream.count,
        downstreamEstimate: downstream.estimate,
        isBlocked,
        isOverdue: metrics.isOverdue,
        isDueSoon: dueSoon,
        riskLevel:
          score >= 18 ? "Alto" : score >= 10 ? "Medio" : "Bajo"
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.issue.code.localeCompare(b.issue.code))
    .slice(0, 10);
}

export function buildDailyLoad(
  issues: PlanningIssueDTO[],
  helpers: IssueHelpers,
  options: { excludeDone?: boolean } = {}
) {
  const excludeDone = options.excludeDone ?? true;
  const activeLeaves = helpers
    .getLeafIssues()
    .filter((issue) => !excludeDone || issue.status !== "DONE")
    .filter((issue) => issues.some((visible) => visible.id === issue.id));

  const cells = new Map<
    string,
    {
      assignee: string;
      date: string;
      minutes: number;
      issueCount: number;
      issues: PlanningIssueDTO[];
    }
  >();

  for (const issue of activeLeaves) {
    const metrics = helpers.getMetrics(issue);
    if (!metrics.startDate || !metrics.dueDate || !metrics.estimate) continue;

    const workdays = getWorkdays(metrics.startDate, metrics.dueDate);
    if (!workdays.length) continue;

    const dailyMinutes = metrics.estimate / workdays.length;

    for (const day of workdays) {
      const dateKey = toDateKey(day);
      const key = `${issue.assigneeId}:${dateKey}`;
      const current =
        cells.get(key) ??
        {
          assignee: issue.assignee.name,
          date: dateKey,
          minutes: 0,
          issueCount: 0,
          issues: []
        };

      current.minutes += dailyMinutes;
      current.issueCount += 1;
      current.issues.push(issue);
      cells.set(key, current);
    }
  }

  return [...cells.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.assignee.localeCompare(b.assignee)
  );
}

export function getAgingBuckets(issues: PlanningIssueDTO[], helpers: IssueHelpers) {
  const openIssues = issues.filter((issue) => issue.status !== "DONE");
  const buckets = [
    { label: "0-7 dias", min: 0, max: 7, tone: "emerald" },
    { label: "8-30 dias", min: 8, max: 30, tone: "amber" },
    { label: "31+ dias", min: 31, max: Number.POSITIVE_INFINITY, tone: "red" }
  ];

  return buckets.map((bucket) => {
    const items = openIssues.filter((issue) => {
      const metrics = helpers.getMetrics(issue);
      const age = metrics.startDate
        ? diffDays(stripTime(metrics.startDate), stripTime(new Date()))
        : 0;
      return age >= bucket.min && age <= bucket.max;
    });

    return {
      ...bucket,
      items
    };
  });
}

export function getStatusProgress(status: IssueStatus) {
  if (status === "DONE") return 100;
  if (status === "IN_PROGRESS") return 60;
  return 10;
}

function getPrincipalIssue(issue: PlanningIssueDTO, helpers: IssueHelpers) {
  if (issue.parentIssueId) {
    return helpers.issueMap.get(issue.parentIssueId) ?? issue.parentIssue;
  }

  if (helpers.getChildren(issue).length) return issue;

  return null;
}

function sortGanttIssues(issues: PlanningIssueDTO[]) {
  return [...issues].sort(
    (a, b) =>
      Number(Boolean(a.parentIssueId)) - Number(Boolean(b.parentIssueId)) ||
      a.position - b.position ||
      a.code.localeCompare(b.code)
  );
}

export function formatDateShort(value?: Date | string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

export function formatDateLong(value?: Date | string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatMinutes(minutes?: number | null) {
  return formatJiraEstimate(minutes) || "Sin estimacion";
}

export function formatHoursFromMinutes(minutes?: number | null) {
  const value = Math.round(((minutes ?? 0) / 60) * 10) / 10;
  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}h`;
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(value?: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return stripTime(date);
}

function isOverdue(date: Date | null, status: IssueStatus) {
  if (!date || status === "DONE") return false;
  return stripTime(date) < stripTime(new Date());
}

function isDueSoon(date: Date | null, status: IssueStatus) {
  if (!date || status === "DONE") return false;
  const daysUntilDue = diffDays(stripTime(new Date()), stripTime(date));
  return daysUntilDue >= 0 && daysUntilDue <= 5;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function earliestDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (!validDates.length) return null;
  return new Date(Math.min(...validDates.map((date) => date.getTime())));
}

function latestDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (!validDates.length) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return stripTime(next);
}

function diffDays(start: Date, end: Date) {
  return Math.round((stripTime(end).getTime() - stripTime(start).getTime()) / DAY_IN_MS);
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getWorkdays(startDate: Date, dueDate: Date) {
  const days: Date[] = [];
  let cursor = stripTime(startDate);
  const end = stripTime(dueDate);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}
