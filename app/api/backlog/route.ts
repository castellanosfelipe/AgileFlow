import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { syncDirectoryUsers } from "@/lib/directory-sync";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { backlogQuerySchema } from "@/lib/schemas";
import { assignableUserWhere } from "@/lib/users";

export const runtime = "nodejs";

const issueInclude = {
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  },
  epic: {
    select: {
      id: true,
      key: true,
      name: true,
      color: true
    }
  }
} satisfies Prisma.IssueInclude;

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const filters = backlogQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined
    });

    const project = await prisma.project.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        name: true
      }
    });

    if (!project) {
      return NextResponse.json(
        {
          project: null,
          currentUser: null,
          users: [],
          epics: [],
          sprints: [],
          backlogIssues: []
        },
        { status: 200 }
      );
    }

    await syncDirectoryUsers(project.id);
    const access = await getCurrentUserAccess(currentUser.id, project.id);

    const issueWhere: Prisma.IssueWhereInput = {
      projectId: project.id
    };

    if (filters.q) {
      issueWhere.OR = [
        { code: { contains: filters.q, mode: "insensitive" } },
        { title: { contains: filters.q, mode: "insensitive" } },
        { epic: { name: { contains: filters.q, mode: "insensitive" } } }
      ];
    }

    if (filters.status && filters.status !== "ALL") {
      issueWhere.status = filters.status;
    }

    if (filters.assigneeId && filters.assigneeId !== "ALL") {
      issueWhere.assigneeId = filters.assigneeId;
    }

    const assignableWhere = await assignableUserWhere(project.id);

    const [users, epics, sprints, backlogIssues] = await Promise.all([
      prisma.user.findMany({
        where: assignableWhere,
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.epic.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          key: true,
          name: true,
          color: true
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.sprint.findMany({
        where: { projectId: project.id },
        include: {
          issues: {
            where: issueWhere,
            include: issueInclude,
            orderBy: [{ position: "asc" }, { createdAt: "asc" }]
          }
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }]
      }),
      prisma.issue.findMany({
        where: {
          ...issueWhere,
          sprintId: null
        },
        include: issueInclude,
        orderBy: [{ position: "asc" }, { createdAt: "asc" }]
      })
    ]);

    return NextResponse.json({
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
      backlogIssues
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return databaseUnavailableResponse();
    }

    return new NextResponse("No se pudo cargar el backlog", { status: 500 });
  }
}
