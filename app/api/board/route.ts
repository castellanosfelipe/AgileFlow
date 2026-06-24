import { IssueStatus, Prisma, SprintStatus } from "@prisma/client";
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
import { boardQuerySchema } from "@/lib/schemas";
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
  },
  labels: {
    select: {
      id: true,
      name: true,
      color: true
    },
    orderBy: { name: "asc" }
  }
} satisfies Prisma.IssueInclude;

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const filters = boardQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      epicId: searchParams.get("epicId") ?? undefined,
      label: searchParams.get("label") ?? undefined,
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
      return NextResponse.json({
        project: null,
        currentUser: null,
        sprint: null,
        users: [],
        epics: [],
        labels: [],
        plannedSprints: []
      });
    }

    await syncDirectoryUsers(project.id);
    const access = await getCurrentUserAccess(currentUser.id, project.id);

    const issueWhere: Prisma.IssueWhereInput = {
      projectId: project.id,
      parentIssueId: null
    };

    if (filters.q) {
      issueWhere.OR = [
        { code: { contains: filters.q, mode: "insensitive" } },
        { title: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
        { epic: { name: { contains: filters.q, mode: "insensitive" } } }
      ];
    }

    if (filters.epicId && filters.epicId !== "ALL") {
      issueWhere.epicId = filters.epicId;
    }

    if (filters.label && filters.label !== "ALL") {
      issueWhere.labels = {
        some: {
          name: filters.label
        }
      };
    }

    if (filters.assigneeId && filters.assigneeId !== "ALL") {
      issueWhere.assigneeId = filters.assigneeId;
    }

    const assignableWhere = await assignableUserWhere(project.id);

    const [sprint, users, epics, labels, plannedSprints] = await Promise.all([
      prisma.sprint.findFirst({
        where: {
          projectId: project.id,
          status: SprintStatus.ACTIVE
        },
        include: {
          issues: {
            where: issueWhere,
            include: issueInclude,
            orderBy: [
              { status: "asc" },
              { position: "asc" },
              { createdAt: "asc" }
            ]
          }
        },
        orderBy: { updatedAt: "desc" }
      }),
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
      prisma.issueLabel.findMany({
        where: {
          issue: {
            projectId: project.id
          }
        },
        select: {
          id: true,
          name: true,
          color: true
        },
        distinct: ["name"],
        orderBy: { name: "asc" }
      }),
      prisma.sprint.findMany({
        where: {
          projectId: project.id,
          status: SprintStatus.PLANNED
        },
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
      sprint,
      users,
      epics,
      labels,
      plannedSprints
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return databaseUnavailableResponse();
    }

    return new NextResponse("No se pudo cargar el tablero", { status: 500 });
  }
}
