import {
  IssuePriority,
  IssueStatus,
  IssueType,
  Prisma,
  ProjectRole,
  SprintStatus
} from "@prisma/client";

import { auditJson } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 500;
const CHILD_PAGE_SIZE = 100;
const JIRA_LOCAL_DOMAIN = "jira.local";

type JiraMigrationConfigInput = {
  id: string;
  jiraUrl: string;
  jql: string;
  username: string;
  token: string;
};

type JiraSyncInput = {
  projectId: string;
  actorUserId: string;
  config: JiraMigrationConfigInput;
};

export type JiraSyncSummary = {
  pages: number;
  fetchedIssues: number;
  importedIssues: number;
  createdIssues: number;
  updatedIssues: number;
  skippedEpicsAsIssues: number;
  users: number;
  epics: number;
  sprints: number;
  labels: number;
  comments: number;
  worklogs: number;
  attachments: number;
  blockers: number;
  lastSyncedAt: string | null;
  warnings: string[];
};

type JiraField = {
  id: string;
  key?: string;
  name: string;
  schema?: {
    custom?: string;
    type?: string;
  };
};

type JiraFieldMap = {
  sprint?: string;
  startDate?: string;
  epicLink?: string;
  epicName?: string;
  epicColor?: string;
};

type JiraUser = {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
  avatarUrls?: Record<string, string>;
};

type JiraIssueType = {
  id?: string;
  name?: string;
  subtask?: boolean;
};

type JiraStatus = {
  name?: string;
  statusCategory?: {
    key?: string;
    name?: string;
  };
};

type JiraPriority = {
  name?: string;
};

type JiraIssueLink = {
  type?: {
    name?: string;
    inward?: string;
    outward?: string;
  };
  inwardIssue?: {
    id?: string;
    key?: string;
  };
  outwardIssue?: {
    id?: string;
    key?: string;
  };
};

type JiraAttachment = {
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  content?: string;
  author?: JiraUser;
  created?: string;
};

type JiraComment = {
  id?: string;
  body?: unknown;
  author?: JiraUser;
  created?: string;
  updated?: string;
};

type JiraWorklog = {
  id?: string;
  comment?: unknown;
  author?: JiraUser;
  timeSpentSeconds?: number;
  started?: string;
  created?: string;
  updated?: string;
};

type JiraPagedComments = {
  comments?: JiraComment[];
  total?: number;
  startAt?: number;
  maxResults?: number;
};

type JiraPagedWorklogs = {
  worklogs?: JiraWorklog[];
  total?: number;
  startAt?: number;
  maxResults?: number;
};

type JiraParent = {
  id?: string;
  key?: string;
  fields?: Record<string, unknown>;
};

type JiraIssue = {
  id: string;
  key: string;
  fields?: Record<string, unknown>;
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
  warningMessages?: string[];
};

type JiraSprint = {
  id: string;
  name: string;
  state?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type NormalizedIssue = {
  jiraIssueId: string;
  code: string;
  title: string;
  description: string | null;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeKey: string;
  reporterKey: string;
  sprintJiraId: string | null;
  epicKey: string | null;
  parentCode: string | null;
  estimate: number | null;
  timeSpent: number;
  timeRemaining: number | null;
  startDate: Date;
  dueDate: Date;
  position: number;
  labels: string[];
  comments: JiraComment[];
  worklogs: JiraWorklog[];
  attachments: JiraAttachment[];
  issueLinks: JiraIssueLink[];
  source: JiraIssue;
};

type UserCache = Map<string, string>;

function basicAuth(username: string, token: string) {
  return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
}

function jiraBaseUrl(config: JiraMigrationConfigInput) {
  return config.jiraUrl.replace(/\/+$/, "");
}

async function getJiraErrorMessage(response: Response) {
  const body = await response.text();

  try {
    const parsed = JSON.parse(body) as {
      errorMessages?: string[];
      errors?: Record<string, string>;
      message?: string;
    };
    const messages = [
      ...(parsed.errorMessages ?? []),
      ...Object.values(parsed.errors ?? {}),
      parsed.message
    ].filter(Boolean);

    if (messages.length) return messages.join(" ");
  } catch {
    // Jira may return HTML or plain text for proxy/auth failures.
  }

  return body || `Jira respondio ${response.status}.`;
}

async function jiraFetchJson<T>(
  url: string | URL,
  authHeader: string,
  init?: RequestInit
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await getJiraErrorMessage(response));
  }

  return (await response.json()) as T;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scoreStartDateField(field: JiraField) {
  const name = normalizeText(field.name);
  const custom = normalizeText(field.schema?.custom ?? "");

  if (name === "fecha de inicio") return 100;
  if (name === "start date") return 95;
  if (name === "planned start") return 80;
  if (name === "target start") return 70;
  if (name === "actual start") return 60;
  if (name.includes("inicio")) return 55;
  if (name.includes("start") && custom.includes("date")) return 50;

  return 0;
}

function detectFieldMap(fields: JiraField[]): JiraFieldMap {
  const fieldMap: JiraFieldMap = {};

  fieldMap.sprint = fields.find((field) => {
    const name = normalizeText(field.name);
    const custom = normalizeText(field.schema?.custom ?? "");
    return name === "sprint" || custom.includes("gh-sprint");
  })?.id;

  fieldMap.epicLink = fields.find((field) => {
    const name = normalizeText(field.name);
    const custom = normalizeText(field.schema?.custom ?? "");
    return (
      name === "epic link" ||
      name === "enlace de epic" ||
      custom.includes("gh-epic-link")
    );
  })?.id;

  fieldMap.epicName = fields.find((field) => {
    const name = normalizeText(field.name);
    const custom = normalizeText(field.schema?.custom ?? "");
    return (
      name === "epic name" ||
      name === "nombre de epic" ||
      custom.includes("gh-epic-label")
    );
  })?.id;

  fieldMap.epicColor = fields.find((field) => {
    const name = normalizeText(field.name);
    const custom = normalizeText(field.schema?.custom ?? "");
    return name === "epic color" || custom.includes("gh-epic-color");
  })?.id;

  fieldMap.startDate = fields
    .map((field) => ({ field, score: scoreStartDateField(field) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.field.id;

  return fieldMap;
}

async function getJiraFieldMap(config: JiraMigrationConfigInput, authHeader: string) {
  const fields = await jiraFetchJson<JiraField[]>(
    `${jiraBaseUrl(config)}/rest/api/3/field`,
    authHeader
  );

  return detectFieldMap(fields);
}

function searchFields(fieldMap: JiraFieldMap) {
  return [
    "summary",
    "description",
    "issuetype",
    "status",
    "priority",
    "assignee",
    "reporter",
    "created",
    "updated",
    "duedate",
    "timeoriginalestimate",
    "timespent",
    "timeestimate",
    "parent",
    "labels",
    "issuelinks",
    "attachment",
    "comment",
    "worklog",
    "project",
    fieldMap.sprint,
    fieldMap.startDate,
    fieldMap.epicLink,
    fieldMap.epicName,
    fieldMap.epicColor
  ].filter(Boolean) as string[];
}

async function fetchAllIssues(
  config: JiraMigrationConfigInput,
  authHeader: string,
  fieldMap: JiraFieldMap
) {
  const issues: JiraIssue[] = [];
  const warnings: string[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  do {
    const searchUrl = new URL(`${jiraBaseUrl(config)}/rest/api/3/search/jql`);
    searchUrl.searchParams.set("jql", config.jql);
    searchUrl.searchParams.set("maxResults", String(DEFAULT_PAGE_SIZE));
    searchUrl.searchParams.set("fields", searchFields(fieldMap).join(","));
    if (nextPageToken) {
      searchUrl.searchParams.set("nextPageToken", nextPageToken);
    }

    const data = await jiraFetchJson<JiraSearchResponse>(searchUrl, authHeader);
    pages += 1;
    issues.push(...(data.issues ?? []));
    warnings.push(...(data.warningMessages ?? []));
    nextPageToken = data.nextPageToken;

    if (data.isLast || !nextPageToken) break;
  } while (nextPageToken);

  return { issues, pages, warnings };
}

function valueAsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueAsString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function valueAsNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minutesFromSeconds(value: unknown) {
  const seconds = valueAsNumber(value);
  return seconds === null ? null : Math.max(Math.round(seconds / 60), 0);
}

function jiraDate(value: unknown) {
  const raw = valueAsString(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00.000Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function textFromRichValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;

  const chunks: string[] = [];

  function walk(node: unknown) {
    if (!node) return;

    if (typeof node === "string") {
      chunks.push(node);
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object") return;
    const current = node as Record<string, unknown>;

    if (typeof current.text === "string") {
      chunks.push(current.text);
    }

    if (current.type === "hardBreak") {
      chunks.push("\n");
    }

    if (Array.isArray(current.content)) {
      current.content.forEach(walk);
    }

    if (
      current.type === "paragraph" ||
      current.type === "heading" ||
      current.type === "listItem"
    ) {
      chunks.push("\n");
    }
  }

  walk(value);

  return (
    chunks
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  );
}

function jiraIssueType(fields: Record<string, unknown>) {
  return valueAsRecord(fields.issuetype) as JiraIssueType | null;
}

function jiraStatus(fields: Record<string, unknown>) {
  return valueAsRecord(fields.status) as JiraStatus | null;
}

function mapIssueStatus(status: JiraStatus | null): IssueStatus {
  const category = normalizeText(status?.statusCategory?.key ?? "");
  const name = normalizeText(status?.name ?? "");

  if (category === "done" || /done|closed|finalizada|finalizado|resuelta/.test(name)) {
    return IssueStatus.DONE;
  }

  if (
    category === "indeterminate" ||
    /progress|progreso|curso|ejecucion|desarrollo/.test(name)
  ) {
    return IssueStatus.IN_PROGRESS;
  }

  return IssueStatus.TODO;
}

function mapIssuePriority(priority: JiraPriority | null): IssuePriority {
  const name = normalizeText(priority?.name ?? "");

  if (/highest|urgent|urgente|critical|critica|bloqueante/.test(name)) {
    return IssuePriority.URGENT;
  }

  if (/high|alta/.test(name)) return IssuePriority.HIGH;
  if (/low|lowest|baja/.test(name)) return IssuePriority.LOW;

  return IssuePriority.MEDIUM;
}

function mapIssueType(fields: Record<string, unknown>, parent: JiraParent | null) {
  const issueType = jiraIssueType(fields);
  const typeName = normalizeText(issueType?.name ?? "");

  if (issueType?.subtask || /sub.?tarea|subtask/.test(typeName)) {
    return IssueType.SUBTASK;
  }

  if (parent && !isEpicParent(parent)) {
    return IssueType.SUBTASK;
  }

  return IssueType.TASK;
}

function isEpicIssue(fields: Record<string, unknown>) {
  const issueType = jiraIssueType(fields);
  return normalizeText(issueType?.name ?? "") === "epic";
}

function isEpicParent(parent: JiraParent) {
  const issueType = valueAsRecord(parent.fields?.issuetype) as JiraIssueType | null;
  return normalizeText(issueType?.name ?? "") === "epic";
}

function jiraUserKey(user: JiraUser | null | undefined) {
  return user?.accountId || user?.emailAddress || user?.displayName || "unassigned";
}

function safeEmailSegment(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function emailForJiraUser(user: JiraUser | null | undefined, fallback: string) {
  const email = user?.emailAddress?.trim().toLowerCase();
  if (email && email.includes("@")) return email;

  const accountId = user?.accountId || fallback;
  return `jira-${safeEmailSegment(accountId)}@${JIRA_LOCAL_DOMAIN}`;
}

function nameForJiraUser(user: JiraUser | null | undefined, fallback: string) {
  return user?.displayName?.trim() || user?.emailAddress?.trim() || fallback;
}

async function ensureJiraUser(
  projectId: string,
  user: JiraUser | null | undefined,
  cache: UserCache,
  fallbackName: string
) {
  const key = jiraUserKey(user);
  const cached = cache.get(key);
  if (cached) return cached;

  const email = emailForJiraUser(user, key);
  const accountId = user?.accountId ?? null;
  const name = nameForJiraUser(user, fallbackName);
  const image = user?.avatarUrls?.["48x48"] ?? user?.avatarUrls?.["24x24"] ?? null;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        accountId ? { jiraAccountId: accountId } : undefined,
        { email }
      ].filter(Boolean) as Prisma.UserWhereInput[]
    }
  });

  const appUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          image,
          isActive: true,
          jiraAccountId:
            accountId && (!existingUser.jiraAccountId || existingUser.jiraAccountId === accountId)
              ? accountId
              : existingUser.jiraAccountId
        }
      })
    : await prisma.user.create({
        data: {
          email,
          jiraAccountId: accountId,
          name,
          image,
          passwordHash: `jira:${accountId ?? email}`,
          isActive: true
        }
      });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId,
        userId: appUser.id
      }
    },
    create: {
      projectId,
      userId: appUser.id,
      role: ProjectRole.MEMBER
    },
    update: {}
  });

  cache.set(key, appUser.id);
  return appUser.id;
}

function parseLegacySprint(raw: string): JiraSprint | null {
  if (!raw.includes("Sprint@")) return null;

  function read(key: string) {
    const match = raw.match(new RegExp(`${key}=([^,\\]]+)`));
    return match?.[1] ?? null;
  }

  const id = read("id");
  const name = read("name");
  if (!id || !name) return null;

  return {
    id,
    name,
    state: read("state") ?? undefined,
    goal: read("goal"),
    startDate: read("startDate"),
    endDate: read("endDate")
  };
}

function parseJiraSprints(value: unknown): JiraSprint[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return parseLegacySprint(item);
        const record = valueAsRecord(item);
        if (!record) return null;
        const id = valueAsString(record.id) ?? String(record.id ?? "");
        const name = valueAsString(record.name) ?? "";
        if (!id || !name) return null;

        return {
          id,
          name,
          state: valueAsString(record.state) ?? undefined,
          goal: valueAsString(record.goal),
          startDate: valueAsString(record.startDate),
          endDate: valueAsString(record.endDate)
        };
      })
      .filter(Boolean) as JiraSprint[];
  }

  if (typeof value === "string") {
    const parsed = parseLegacySprint(value);
    return parsed ? [parsed] : [];
  }

  return [];
}

function chooseIssueSprint(sprints: JiraSprint[]) {
  if (!sprints.length) return null;

  const sorted = [...sprints].sort((left, right) => {
    const leftDate = jiraDate(left.startDate)?.getTime() ?? Number(left.id) ?? 0;
    const rightDate = jiraDate(right.startDate)?.getTime() ?? Number(right.id) ?? 0;
    return leftDate - rightDate;
  });

  return (
    sorted.find((sprint) => normalizeText(sprint.state ?? "") === "active") ??
    sorted[sorted.length - 1] ??
    null
  );
}

function mapSprintStatus(sprint: JiraSprint, selectedActiveSprintId: string | null) {
  const state = normalizeText(sprint.state ?? "");
  if (selectedActiveSprintId && sprint.id === selectedActiveSprintId) {
    return SprintStatus.ACTIVE;
  }
  if (/closed|complete|completed|cerrado/.test(state)) return SprintStatus.COMPLETED;
  return SprintStatus.PLANNED;
}

function epicColorFromValue(value: unknown) {
  const raw = typeof value === "string" ? value : null;
  if (!raw) return "#2563eb";
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/green/i.test(raw)) return "#16a34a";
  if (/yellow/i.test(raw)) return "#ca8a04";
  if (/purple/i.test(raw)) return "#7c3aed";
  if (/red/i.test(raw)) return "#dc2626";
  return "#2563eb";
}

function extractEpicKey(fields: Record<string, unknown>, fieldMap: JiraFieldMap) {
  const epicLink = fieldMap.epicLink ? fields[fieldMap.epicLink] : null;
  if (typeof epicLink === "string") return epicLink;

  const parent = valueAsRecord(fields.parent) as JiraParent | null;
  if (parent?.key && isEpicParent(parent)) return parent.key;

  return null;
}

function normalizeParent(fields: Record<string, unknown>) {
  return valueAsRecord(fields.parent) as JiraParent | null;
}

function normalizeIssue(
  issue: JiraIssue,
  fieldMap: JiraFieldMap,
  index: number,
  fallbackUserKey: string
): NormalizedIssue {
  const fields = issue.fields ?? {};
  const parent = normalizeParent(fields);
  const assignee = valueAsRecord(fields.assignee) as JiraUser | null;
  const reporter = valueAsRecord(fields.reporter) as JiraUser | null;
  const sprint = chooseIssueSprint(
    parseJiraSprints(fieldMap.sprint ? fields[fieldMap.sprint] : null)
  );
  const startDate =
    jiraDate(fieldMap.startDate ? fields[fieldMap.startDate] : null) ??
    jiraDate(fields.created) ??
    new Date();
  const dueDate = jiraDate(fields.duedate) ?? startDate;
  const estimate = minutesFromSeconds(fields.timeoriginalestimate);
  const timeSpent = minutesFromSeconds(fields.timespent) ?? 0;
  const timeRemaining = minutesFromSeconds(fields.timeestimate);

  return {
    jiraIssueId: issue.id,
    code: issue.key,
    title: valueAsString(fields.summary) ?? issue.key,
    description: textFromRichValue(fields.description),
    type: mapIssueType(fields, parent),
    status: mapIssueStatus(jiraStatus(fields)),
    priority: mapIssuePriority(valueAsRecord(fields.priority) as JiraPriority | null),
    assigneeKey: jiraUserKey(assignee) || fallbackUserKey,
    reporterKey: jiraUserKey(reporter) || fallbackUserKey,
    sprintJiraId: sprint?.id ?? null,
    epicKey: extractEpicKey(fields, fieldMap),
    parentCode: parent?.key && !isEpicParent(parent) ? parent.key : null,
    estimate,
    timeSpent,
    timeRemaining,
    startDate,
    dueDate,
    position: (index + 1) * 1000,
    labels: Array.isArray(fields.labels)
      ? fields.labels.filter((label): label is string => typeof label === "string")
      : [],
    comments: ((valueAsRecord(fields.comment)?.comments ?? []) as JiraComment[]) ?? [],
    worklogs: ((valueAsRecord(fields.worklog)?.worklogs ?? []) as JiraWorklog[]) ?? [],
    attachments: Array.isArray(fields.attachment)
      ? (fields.attachment as JiraAttachment[])
      : [],
    issueLinks: Array.isArray(fields.issuelinks)
      ? (fields.issuelinks as JiraIssueLink[])
      : [],
    source: issue
  };
}

async function fetchAllIssueComments(
  config: JiraMigrationConfigInput,
  authHeader: string,
  issueKey: string,
  existingComments: JiraComment[],
  total: number
) {
  if (!total || existingComments.length >= total) return existingComments;

  const comments: JiraComment[] = [];
  let startAt = 0;

  while (startAt < total) {
    const url = new URL(`${jiraBaseUrl(config)}/rest/api/3/issue/${issueKey}/comment`);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(CHILD_PAGE_SIZE));
    url.searchParams.set("orderBy", "created");
    const data = await jiraFetchJson<JiraPagedComments>(url, authHeader);
    const page = data.comments ?? [];
    comments.push(...page);
    startAt += data.maxResults ?? CHILD_PAGE_SIZE;
    if (!page.length) break;
  }

  return comments;
}

async function fetchAllIssueWorklogs(
  config: JiraMigrationConfigInput,
  authHeader: string,
  issueKey: string,
  existingWorklogs: JiraWorklog[],
  total: number
) {
  if (!total || existingWorklogs.length >= total) return existingWorklogs;

  const worklogs: JiraWorklog[] = [];
  let startAt = 0;

  while (startAt < total) {
    const url = new URL(`${jiraBaseUrl(config)}/rest/api/3/issue/${issueKey}/worklog`);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(CHILD_PAGE_SIZE));
    const data = await jiraFetchJson<JiraPagedWorklogs>(url, authHeader);
    const page = data.worklogs ?? [];
    worklogs.push(...page);
    startAt += data.maxResults ?? CHILD_PAGE_SIZE;
    if (!page.length) break;
  }

  return worklogs;
}

async function hydrateChildCollections(
  config: JiraMigrationConfigInput,
  authHeader: string,
  issue: NormalizedIssue
) {
  const commentInfo = valueAsRecord(issue.source.fields?.comment);
  const worklogInfo = valueAsRecord(issue.source.fields?.worklog);
  const commentTotal = valueAsNumber(commentInfo?.total) ?? issue.comments.length;
  const worklogTotal = valueAsNumber(worklogInfo?.total) ?? issue.worklogs.length;

  issue.comments = await fetchAllIssueComments(
    config,
    authHeader,
    issue.code,
    issue.comments,
    commentTotal
  );
  issue.worklogs = await fetchAllIssueWorklogs(
    config,
    authHeader,
    issue.code,
    issue.worklogs,
    worklogTotal
  );
}

function parentPlaceholder(
  issue: NormalizedIssue,
  fallbackUserKey: string
): NormalizedIssue | null {
  const parent = normalizeParent(issue.source.fields ?? {});
  if (!parent?.id || !parent.key || isEpicParent(parent)) return null;

  const fields = parent.fields ?? {};
  const startDate = issue.startDate;
  const dueDate = issue.dueDate;

  return {
    jiraIssueId: parent.id,
    code: parent.key,
    title: valueAsString(fields.summary) ?? parent.key,
    description: null,
    type: IssueType.TASK,
    status: mapIssueStatus(valueAsRecord(fields.status) as JiraStatus | null),
    priority: IssuePriority.MEDIUM,
    assigneeKey: fallbackUserKey,
    reporterKey: fallbackUserKey,
    sprintJiraId: issue.sprintJiraId,
    epicKey: null,
    parentCode: null,
    estimate: null,
    timeSpent: 0,
    timeRemaining: null,
    startDate,
    dueDate,
    position: issue.position - 1,
    labels: [],
    comments: [],
    worklogs: [],
    attachments: [],
    issueLinks: [],
    source: {
      id: parent.id,
      key: parent.key,
      fields
    }
  };
}

async function syncSprints(
  projectId: string,
  issues: JiraIssue[],
  fieldMap: JiraFieldMap
) {
  const sprints = new Map<string, JiraSprint>();

  for (const issue of issues) {
    const fields = issue.fields ?? {};
    for (const sprint of parseJiraSprints(
      fieldMap.sprint ? fields[fieldMap.sprint] : null
    )) {
      sprints.set(sprint.id, sprint);
    }
  }

  const activeSprints = [...sprints.values()]
    .filter((sprint) => normalizeText(sprint.state ?? "") === "active")
    .sort((left, right) => {
      const leftTime = jiraDate(left.startDate)?.getTime() ?? Number(left.id) ?? 0;
      const rightTime = jiraDate(right.startDate)?.getTime() ?? Number(right.id) ?? 0;
      return rightTime - leftTime;
    });
  const selectedActiveSprintId = activeSprints[0]?.id ?? null;

  if (selectedActiveSprintId) {
    await prisma.sprint.updateMany({
      where: { projectId, status: SprintStatus.ACTIVE },
      data: {
        status: SprintStatus.PLANNED,
        activeProjectId: null
      }
    });
  }

  let index = 0;
  for (const sprint of sprints.values()) {
    index += 1;
    const status = mapSprintStatus(sprint, selectedActiveSprintId);
    const startsAt = jiraDate(sprint.startDate);
    const endsAt = jiraDate(sprint.endDate);
    const existing = await prisma.sprint.findFirst({
      where: {
        OR: [{ jiraSprintId: sprint.id }, { projectId, name: sprint.name }]
      }
    });

    const data = {
      projectId,
      jiraSprintId: sprint.id,
      name: sprint.name,
      goal: sprint.goal || null,
      status,
      startsAt,
      endsAt,
      position: index * 10,
      activeProjectId: status === SprintStatus.ACTIVE ? projectId : null
    };

    if (existing) {
      await prisma.sprint.update({
        where: { id: existing.id },
        data
      });
    } else {
      await prisma.sprint.create({ data });
    }
  }

  return {
    selectedActiveSprintId,
    count: sprints.size
  };
}

async function syncEpics(
  projectId: string,
  issues: JiraIssue[],
  fieldMap: JiraFieldMap
) {
  const epics = new Map<
    string,
    {
      jiraIssueId: string | null;
      key: string;
      name: string;
      color: string;
      description: string | null;
    }
  >();

  for (const issue of issues) {
    const fields = issue.fields ?? {};
    if (isEpicIssue(fields)) {
      epics.set(issue.key, {
        jiraIssueId: issue.id,
        key: issue.key,
        name:
          valueAsString(fieldMap.epicName ? fields[fieldMap.epicName] : null) ??
          valueAsString(fields.summary) ??
          issue.key,
        color: epicColorFromValue(fieldMap.epicColor ? fields[fieldMap.epicColor] : null),
        description: textFromRichValue(fields.description)
      });
      continue;
    }

    const epicKey = extractEpicKey(fields, fieldMap);
    if (epicKey && !epics.has(epicKey)) {
      epics.set(epicKey, {
        jiraIssueId: null,
        key: epicKey,
        name: epicKey,
        color: "#2563eb",
        description: null
      });
    }
  }

  for (const epic of epics.values()) {
    const existing = await prisma.epic.findFirst({
      where: {
        OR: [
          epic.jiraIssueId ? { jiraIssueId: epic.jiraIssueId } : undefined,
          { key: epic.key }
        ].filter(Boolean) as Prisma.EpicWhereInput[]
      }
    });

    if (existing) {
      await prisma.epic.update({
        where: { id: existing.id },
        data: epic
      });
    } else {
      await prisma.epic.create({
        data: {
          projectId,
          ...epic
        }
      });
    }
  }

  return epics.size;
}

async function loadLookupMaps(projectId: string) {
  const [users, sprints, epics, issues] = await Promise.all([
    prisma.user.findMany({
      where: {
        memberships: {
          some: { projectId }
        }
      },
      select: { id: true, email: true, jiraAccountId: true }
    }),
    prisma.sprint.findMany({
      where: { projectId },
      select: { id: true, jiraSprintId: true, name: true }
    }),
    prisma.epic.findMany({
      where: { projectId },
      select: { id: true, key: true, jiraIssueId: true }
    }),
    prisma.issue.findMany({
      where: { projectId },
      select: { id: true, code: true, jiraIssueId: true }
    })
  ]);

  const userByKey = new Map<string, string>();
  for (const user of users) {
    if (user.jiraAccountId) userByKey.set(user.jiraAccountId, user.id);
    userByKey.set(user.email, user.id);
  }

  return {
    userByKey,
    sprintByJiraId: new Map(
      sprints
        .filter((sprint) => sprint.jiraSprintId)
        .map((sprint) => [sprint.jiraSprintId as string, sprint.id])
    ),
    epicByKey: new Map(epics.map((epic) => [epic.key, epic.id])),
    issueByCode: new Map(issues.map((issue) => [issue.code, issue.id])),
    issueByJiraId: new Map(
      issues
        .filter((issue) => issue.jiraIssueId)
        .map((issue) => [issue.jiraIssueId as string, issue.id])
    )
  };
}

async function syncIssueLabels(issueId: string, labels: string[]) {
  let count = 0;

  for (const label of labels) {
    await prisma.issueLabel.upsert({
      where: {
        issueId_name: {
          issueId,
          name: label
        }
      },
      create: {
        issueId,
        name: label
      },
      update: {}
    });
    count += 1;
  }

  return count;
}

async function syncIssueComments(
  projectId: string,
  issueId: string,
  comments: JiraComment[],
  users: UserCache
) {
  let count = 0;

  for (const comment of comments) {
    if (!comment.id) continue;
    const authorId = await ensureJiraUser(
      projectId,
      comment.author,
      users,
      "Usuario Jira"
    );
    const createdAt = jiraDate(comment.created) ?? new Date();
    const body = textFromRichValue(comment.body) ?? "";
    if (!body.trim()) continue;

    await prisma.issueComment.upsert({
      where: { jiraCommentId: comment.id },
      create: {
        issueId,
        authorId,
        jiraCommentId: comment.id,
        body,
        createdAt
      },
      update: {
        authorId,
        body,
        createdAt
      }
    });
    count += 1;
  }

  return count;
}

async function syncIssueWorklogs(
  projectId: string,
  issueId: string,
  worklogs: JiraWorklog[],
  users: UserCache
) {
  let count = 0;

  for (const worklog of worklogs) {
    if (!worklog.id) continue;
    const authorId = await ensureJiraUser(
      projectId,
      worklog.author,
      users,
      "Usuario Jira"
    );
    const timeSpent = minutesFromSeconds(worklog.timeSpentSeconds) ?? 0;
    if (timeSpent <= 0) continue;

    await prisma.issueWorklog.upsert({
      where: { jiraWorklogId: worklog.id },
      create: {
        issueId,
        authorId,
        jiraWorklogId: worklog.id,
        timeSpent,
        description: textFromRichValue(worklog.comment) ?? "Tiempo registrado en Jira",
        createdAt: jiraDate(worklog.started) ?? jiraDate(worklog.created) ?? new Date()
      },
      update: {
        authorId,
        timeSpent,
        description: textFromRichValue(worklog.comment) ?? "Tiempo registrado en Jira",
        createdAt: jiraDate(worklog.started) ?? jiraDate(worklog.created) ?? new Date()
      }
    });
    count += 1;
  }

  return count;
}

async function syncIssueAttachments(
  projectId: string,
  issueId: string,
  attachments: JiraAttachment[],
  users: UserCache
) {
  let count = 0;

  for (const attachment of attachments) {
    if (!attachment.id || !attachment.content) continue;
    const uploaderId = await ensureJiraUser(
      projectId,
      attachment.author,
      users,
      "Usuario Jira"
    );

    await prisma.issueAttachment.upsert({
      where: { jiraAttachmentId: attachment.id },
      create: {
        issueId,
        uploaderId,
        jiraAttachmentId: attachment.id,
        name: attachment.filename ?? `Adjunto ${attachment.id}`,
        mimeType: attachment.mimeType ?? "application/octet-stream",
        size: attachment.size ?? 0,
        url: attachment.content,
        storagePath: attachment.content,
        createdAt: jiraDate(attachment.created) ?? new Date()
      },
      update: {
        uploaderId,
        name: attachment.filename ?? `Adjunto ${attachment.id}`,
        mimeType: attachment.mimeType ?? "application/octet-stream",
        size: attachment.size ?? 0,
        url: attachment.content,
        storagePath: attachment.content,
        createdAt: jiraDate(attachment.created) ?? new Date()
      }
    });
    count += 1;
  }

  return count;
}

function blockerRelationFromLink(issue: NormalizedIssue, link: JiraIssueLink) {
  const outwardLabel = normalizeText(link.type?.outward ?? "");
  const inwardLabel = normalizeText(link.type?.inward ?? "");
  const typeName = normalizeText(link.type?.name ?? "");
  const isBlocksLink =
    typeName.includes("blocks") ||
    outwardLabel.includes("blocks") ||
    outwardLabel.includes("bloquea") ||
    inwardLabel.includes("blocked") ||
    inwardLabel.includes("bloquead");

  if (!isBlocksLink) return null;

  if (link.outwardIssue?.key) {
    return {
      blockedCode: link.outwardIssue.key,
      blockerCode: issue.code
    };
  }

  if (link.inwardIssue?.key) {
    return {
      blockedCode: issue.code,
      blockerCode: link.inwardIssue.key
    };
  }

  return null;
}

async function syncIssueBlockers(
  projectId: string,
  issues: NormalizedIssue[],
  issueByCode: Map<string, string>
) {
  let count = 0;
  const uniqueRelations = new Map<string, { blockedIssueId: string; blockerIssueId: string }>();

  for (const issue of issues) {
    for (const link of issue.issueLinks) {
      const relation = blockerRelationFromLink(issue, link);
      if (!relation) continue;

      const blockedIssueId = issueByCode.get(relation.blockedCode);
      const blockerIssueId = issueByCode.get(relation.blockerCode);
      if (!blockedIssueId || !blockerIssueId || blockedIssueId === blockerIssueId) {
        continue;
      }

      uniqueRelations.set(`${blockedIssueId}:${blockerIssueId}`, {
        blockedIssueId,
        blockerIssueId
      });
    }
  }

  for (const relation of uniqueRelations.values()) {
    await prisma.issueBlocker.upsert({
      where: {
        blockedIssueId_blockerIssueId: relation
      },
      create: {
        ...relation,
        isBlockingUntilDone: false
      },
      update: {}
    });
    count += 1;
  }

  if (count) {
    const firstBlockers = await prisma.issueBlocker.findMany({
      where: {
        blockedIssue: { projectId }
      },
      orderBy: { createdAt: "asc" },
      distinct: ["blockedIssueId"],
      select: {
        blockedIssueId: true,
        blockerIssueId: true,
        isBlockingUntilDone: true
      }
    });

    for (const blocker of firstBlockers) {
      await prisma.issue.update({
        where: { id: blocker.blockedIssueId },
        data: {
          blockedByIssueId: blocker.blockerIssueId,
          isBlockedUntilDone: blocker.isBlockingUntilDone
        }
      });
    }
  }

  return count;
}

function uniqueNormalizedIssues(issues: NormalizedIssue[]) {
  const byCode = new Map<string, NormalizedIssue>();
  for (const issue of issues) {
    byCode.set(issue.code, issue);
  }
  return [...byCode.values()];
}

export async function syncJiraProject({
  projectId,
  actorUserId,
  config
}: JiraSyncInput): Promise<JiraSyncSummary> {
  const authHeader = basicAuth(config.username, config.token);
  const fieldMap = await getJiraFieldMap(config, authHeader);
  const searchResult = await fetchAllIssues(config, authHeader, fieldMap);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { key: true }
  });
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: actorUserId },
    select: { email: true, name: true }
  });
  const userCache: UserCache = new Map();
  userCache.set(actor.email, actorUserId);

  const fallbackUserKey = actor.email;
  const normalizedFromSearch = searchResult.issues
    .filter((issue) => !isEpicIssue(issue.fields ?? {}))
    .map((issue, index) =>
      normalizeIssue(issue, fieldMap, index, fallbackUserKey)
    );
  const placeholders = normalizedFromSearch
    .map((issue) => parentPlaceholder(issue, fallbackUserKey))
    .filter(Boolean) as NormalizedIssue[];
  const normalizedIssues = uniqueNormalizedIssues([
    ...placeholders,
    ...normalizedFromSearch
  ]);

  await syncSprints(projectId, searchResult.issues, fieldMap);
  const epicCount = await syncEpics(projectId, searchResult.issues, fieldMap);

  for (const issue of normalizedIssues) {
    const assignee = valueAsRecord(issue.source.fields?.assignee) as JiraUser | null;
    const reporter = valueAsRecord(issue.source.fields?.reporter) as JiraUser | null;
    await ensureJiraUser(projectId, assignee, userCache, actor.name);
    await ensureJiraUser(projectId, reporter, userCache, actor.name);
  }

  const lookup = await loadLookupMaps(projectId);
  const existingIssueIds = new Set<string>(lookup.issueByCode.values());
  let createdIssues = 0;
  let updatedIssues = 0;
  let labels = 0;
  let comments = 0;
  let worklogs = 0;
  let attachments = 0;

  for (const issue of normalizedIssues) {
    await hydrateChildCollections(config, authHeader, issue);

    const assigneeId =
      lookup.userByKey.get(issue.assigneeKey) ??
      userCache.get(issue.assigneeKey) ??
      actorUserId;
    const reporterId =
      lookup.userByKey.get(issue.reporterKey) ??
      userCache.get(issue.reporterKey) ??
      actorUserId;
    const existingId =
      lookup.issueByJiraId.get(issue.jiraIssueId) ?? lookup.issueByCode.get(issue.code);
    const sprintId = issue.sprintJiraId
      ? lookup.sprintByJiraId.get(issue.sprintJiraId) ?? null
      : null;
    const epicId = issue.epicKey ? lookup.epicByKey.get(issue.epicKey) ?? null : null;

    const data = {
      projectId,
      jiraIssueId: issue.jiraIssueId,
      sprintId,
      epicId,
      assigneeId,
      reporterId,
      code: issue.code,
      title: issue.title,
      description: issue.description,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      estimate: issue.estimate,
      timeSpent: issue.timeSpent,
      timeRemaining: issue.timeRemaining,
      startDate: issue.startDate,
      dueDate: issue.dueDate,
      position: issue.position
    };

    const savedIssue = existingId
      ? await prisma.issue.update({
          where: { id: existingId },
          data
        })
      : await prisma.issue.create({
          data
        });

    if (existingId) {
      updatedIssues += 1;
    } else {
      createdIssues += 1;
      lookup.issueByCode.set(issue.code, savedIssue.id);
      lookup.issueByJiraId.set(issue.jiraIssueId, savedIssue.id);

      await prisma.auditLog.create({
        data: {
          projectId,
          issueId: savedIssue.id,
          userId: actorUserId,
          action: "issue.created",
          entityType: "Issue",
          entityId: savedIssue.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            code: savedIssue.code,
            title: savedIssue.title,
            status: savedIssue.status,
            sprintId: savedIssue.sprintId,
            parentIssueId: savedIssue.parentIssueId,
            assigneeId: savedIssue.assigneeId,
            estimate: savedIssue.estimate,
            type: savedIssue.type,
            source: "jira"
          })
        }
      });
    }

    labels += await syncIssueLabels(savedIssue.id, issue.labels);
    comments += await syncIssueComments(projectId, savedIssue.id, issue.comments, userCache);
    worklogs += await syncIssueWorklogs(projectId, savedIssue.id, issue.worklogs, userCache);
    attachments += await syncIssueAttachments(
      projectId,
      savedIssue.id,
      issue.attachments,
      userCache
    );
  }

  const currentIssueMap = await prisma.issue.findMany({
    where: { projectId },
    select: { id: true, code: true, jiraIssueId: true }
  });
  const issueByCode = new Map(currentIssueMap.map((issue) => [issue.code, issue.id]));
  const issueByJiraId = new Map(
    currentIssueMap
      .filter((issue) => issue.jiraIssueId)
      .map((issue) => [issue.jiraIssueId as string, issue.id])
  );

  for (const issue of normalizedIssues) {
    const issueId = issueByCode.get(issue.code) ?? issueByJiraId.get(issue.jiraIssueId);
    if (!issueId) continue;
    const parentIssueId = issue.parentCode ? issueByCode.get(issue.parentCode) ?? null : null;

    await prisma.issue.update({
      where: { id: issueId },
      data: {
        parentIssueId
      }
    });
  }

  const blockers = await syncIssueBlockers(projectId, normalizedIssues, issueByCode);
  const importedCodes = normalizedIssues.map((issue) => issue.code);
  const projectCounterMax = importedCodes.reduce((max, code) => {
    const match = code.match(new RegExp(`^${project.key}-(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  if (projectCounterMax > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        issueCounter: {
          set: projectCounterMax
        }
      }
    });
  }

  const lastSyncedAt = new Date();
  await prisma.jiraMigrationConfig.update({
    where: { id: config.id },
    data: { lastSyncedAt }
  });

  const users = await prisma.projectMember.count({ where: { projectId } });
  const sprints = await prisma.sprint.count({ where: { projectId } });

  return {
    pages: searchResult.pages,
    fetchedIssues: searchResult.issues.length,
    importedIssues: normalizedIssues.length,
    createdIssues,
    updatedIssues,
    skippedEpicsAsIssues: searchResult.issues.length - normalizedFromSearch.length,
    users,
    epics: epicCount,
    sprints,
    labels,
    comments,
    worklogs,
    attachments,
    blockers,
    lastSyncedAt: lastSyncedAt.toISOString(),
    warnings: searchResult.warnings
  };
}
