import { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { syncDirectoryUsers } from "@/lib/directory-sync";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { assignableUserWhere } from "@/lib/users";

export type InsightEndpoint = "gantt" | "pert" | "executive";

export class InsightsUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "InsightsUnauthorizedError";
  }
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true
} satisfies Prisma.UserSelect;

const epicSelect = {
  id: true,
  key: true,
  name: true,
  color: true
} satisfies Prisma.EpicSelect;

const sprintSelect = {
  id: true,
  name: true,
  goal: true,
  status: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.SprintSelect;

const issueSummarySelect = {
  id: true,
  code: true,
  title: true,
  type: true,
  status: true,
  estimate: true,
  startDate: true,
  dueDate: true,
  assignee: {
    select: userSelect
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.IssueSelect;

const blockerSelect = {
  id: true,
  blockedIssueId: true,
  blockerIssueId: true,
  isBlockingUntilDone: true,
  blockerIssue: {
    select: issueSummarySelect
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.IssueBlockerSelect;

const blockingLinkSelect = {
  id: true,
  blockedIssueId: true,
  blockerIssueId: true,
  isBlockingUntilDone: true,
  blockedIssue: {
    select: issueSummarySelect
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.IssueBlockerSelect;

const worklogSelect = {
  id: true,
  issueId: true,
  authorId: true,
  timeSpent: true,
  description: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.IssueWorklogSelect;

function getIssueSelect(endpoint: InsightEndpoint): Prisma.IssueSelect {
  const select: Prisma.IssueSelect = {
    id: true,
    projectId: true,
    code: true,
    title: true,
    type: true,
    status: true,
    estimate: true,
    timeSpent: true,
    timeRemaining: true,
    startDate: true,
    dueDate: true,
    position: true,
    epicId: true,
    sprintId: true,
    parentIssueId: true,
    assigneeId: true,
    assignee: {
      select: userSelect
    },
    epic: {
      select: epicSelect
    },
    sprint: {
      select: sprintSelect
    },
    parentIssue: {
      select: issueSummarySelect
    },
    createdAt: true,
    updatedAt: true
  };

  if (endpoint === "gantt" || endpoint === "pert") {
    select.blockers = {
      select: blockerSelect,
      orderBy: { createdAt: "asc" }
    };
  }

  if (endpoint === "pert") {
    select.blockingLinks = {
      select: blockingLinkSelect,
      orderBy: { createdAt: "asc" }
    };
  }

  if (endpoint === "gantt") {
    select.worklogs = {
      select: worklogSelect,
      orderBy: { createdAt: "desc" }
    };
  }

  return select;
}

type InsightIssueRecord = Record<string, unknown> & {
  blockers?: unknown[];
  blockingLinks?: unknown[];
  worklogs?: unknown[];
};

function normalizeInsightIssues(issues: InsightIssueRecord[]) {
  return issues.map((issue) => ({
    ...issue,
    blockers: Array.isArray(issue.blockers) ? issue.blockers : [],
    blockingLinks: Array.isArray(issue.blockingLinks) ? issue.blockingLinks : [],
    worklogs: Array.isArray(issue.worklogs) ? issue.worklogs : []
  }));
}

export async function loadProjectInsightsData(endpoint: InsightEndpoint) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new InsightsUnauthorizedError();

  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      key: true,
      name: true
    }
  });

  if (!project) {
    return {
      project: null,
      currentUser: null,
      users: [],
      epics: [],
      sprints: [],
      issues: []
    };
  }

  await syncDirectoryUsers(project.id);
  const access = await getCurrentUserAccess(currentUser.id, project.id);
  const assignableWhere = await assignableUserWhere(project.id);

  const [users, epics, sprints, issues] = await Promise.all([
    prisma.user.findMany({
      where: assignableWhere,
      select: userSelect,
      orderBy: { name: "asc" }
    }),
    prisma.epic.findMany({
      where: { projectId: project.id },
      select: epicSelect,
      orderBy: { createdAt: "asc" }
    }),
    prisma.sprint.findMany({
      where: { projectId: project.id },
      select: sprintSelect,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    }),
    prisma.issue.findMany({
      where: { projectId: project.id },
      select: getIssueSelect(endpoint),
      orderBy: [
        { sprint: { position: "asc" } },
        { position: "asc" },
        { createdAt: "asc" }
      ]
    })
  ]);

  return {
    project,
    currentUser: {
      id: currentUser.id,
      name: currentUser.name ?? "",
      email: currentUser.email ?? "",
      image: currentUser.image ?? null,
      role: access.appRole
    },
    users,
    epics,
    sprints,
    issues: normalizeInsightIssues(issues as InsightIssueRecord[])
  };
}
