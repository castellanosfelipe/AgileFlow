import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditAssignedIssue,
  getCurrentUserAccess
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true
} satisfies Prisma.UserSelect;

async function getIssueContext(id: string) {
  return prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      sprintId: true,
      assigneeId: true
    }
  });
}

async function canCurrentUserEditIssue(currentUserId: string, issue: {
  projectId: string;
  assigneeId: string;
}) {
  const access = await getCurrentUserAccess(currentUserId, issue.projectId);
  return canEditAssignedIssue({
    currentUserId,
    isAdmin: access.isAdmin,
    assigneeId: issue.assigneeId
  });
}

async function validateBlockerIssue({
  blockedIssueId,
  blockerIssueId,
  projectId,
  sprintId
}: {
  blockedIssueId: string;
  blockerIssueId: string;
  projectId: string;
  sprintId: string | null;
}) {
  if (blockedIssueId === blockerIssueId) {
    return {
      error: new NextResponse("Una tarea no se puede bloquear a sí misma", {
        status: 400
      })
    };
  }

  if (!sprintId) {
    return {
      error: new NextResponse(
        "La tarea debe estar dentro de un sprint para agregar bloqueos",
        { status: 400 }
      )
    };
  }

  const blocker = await prisma.issue.findFirst({
    where: {
      id: blockerIssueId,
      projectId,
      sprintId
    },
    select: {
      id: true,
      code: true
    }
  });

  if (!blocker) {
    return {
      error: new NextResponse(
        "Selecciona una tarea o subtarea del mismo sprint",
        { status: 400 }
      )
    };
  }

  const circularBlock = await prisma.issueBlocker.findFirst({
    where: {
      blockedIssueId: blockerIssueId,
      blockerIssueId: blockedIssueId
    },
    select: { id: true }
  });

  if (circularBlock) {
    return {
      error: new NextResponse("Ese bloqueo crearía una dependencia circular", {
        status: 400
      })
    };
  }

  return { blocker };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    const issue = await getIssueContext(id);

    if (!issue) {
      return new NextResponse("Tarea no encontrada", { status: 404 });
    }

    if (!issue.sprintId) {
      return NextResponse.json([]);
    }

    const existingBlockers = await prisma.issueBlocker.findMany({
      where: { blockedIssueId: issue.id },
      select: { blockerIssueId: true }
    });

    const blockers = await prisma.issue.findMany({
      where: {
        projectId: issue.projectId,
        sprintId: issue.sprintId,
        id: {
          notIn: [issue.id, ...existingBlockers.map((item) => item.blockerIssueId)]
        },
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: "insensitive" } },
                { title: { contains: query, mode: "insensitive" } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: userSelect
        }
      },
      orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      take: 12
    });

    return NextResponse.json(blockers);
  } catch (error) {
    return new NextResponse("No se pudieron buscar tareas del sprint", {
      status: 500
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const body = (await request.json()) as { blockerIssueId?: string };
    const issue = await getIssueContext(id);

    if (!issue) {
      return new NextResponse("Tarea no encontrada", { status: 404 });
    }

    if (!(await canCurrentUserEditIssue(currentUser.id, issue))) {
      return forbiddenResponse("Solo puedes modificar bloqueos de tareas asignadas a ti");
    }

    if (!body.blockerIssueId) {
      return new NextResponse("Selecciona la tarea que bloquea", {
        status: 400
      });
    }

    const blockerIssueId = body.blockerIssueId;

    const validation = await validateBlockerIssue({
      blockedIssueId: issue.id,
      blockerIssueId,
      projectId: issue.projectId,
      sprintId: issue.sprintId
    });

    if (validation.error) return validation.error;

    const blockerLink = await prisma.$transaction(async (tx) => {
      const link = await tx.issueBlocker.upsert({
        where: {
          blockedIssueId_blockerIssueId: {
            blockedIssueId: issue.id,
            blockerIssueId
          }
        },
        create: {
          blockedIssueId: issue.id,
          blockerIssueId
        },
        update: {},
        include: {
          blockerIssue: {
            select: {
              id: true,
              code: true,
              title: true,
              type: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              assignee: {
                select: userSelect
              }
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          userId: currentUser.id,
          action: "issue.blocker_added",
          entityType: "Issue",
          entityId: issue.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            blockerIssueId,
            blockerCode: validation.blocker?.code
          })
        }
      });

      return link;
    });

    return NextResponse.json(blockerLink, { status: 201 });
  } catch (error) {
    return new NextResponse("No se pudo agregar el bloqueo", { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const body = (await request.json()) as {
      blockerLinkId?: string;
      isBlockingUntilDone?: boolean;
    };
    const issue = await getIssueContext(id);

    if (!issue) {
      return new NextResponse("Tarea no encontrada", { status: 404 });
    }

    if (!(await canCurrentUserEditIssue(currentUser.id, issue))) {
      return forbiddenResponse("Solo puedes modificar bloqueos de tareas asignadas a ti");
    }

    if (!body.blockerLinkId) {
      return new NextResponse("Selecciona el bloqueo que quieres actualizar", {
        status: 400
      });
    }

    const currentLink = await prisma.issueBlocker.findFirst({
      where: {
        id: body.blockerLinkId,
        blockedIssueId: issue.id
      },
      include: {
        blockerIssue: {
          select: { code: true }
        }
      }
    });

    if (!currentLink) {
      return new NextResponse("Bloqueo no encontrado", { status: 404 });
    }

    const nextValue = Boolean(body.isBlockingUntilDone);
    const blockerLink = await prisma.$transaction(async (tx) => {
      const link = await tx.issueBlocker.update({
        where: { id: currentLink.id },
        data: {
          isBlockingUntilDone: nextValue
        },
        include: {
          blockerIssue: {
            select: {
              id: true,
              code: true,
              title: true,
              type: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              assignee: {
                select: userSelect
              }
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          userId: currentUser.id,
          action: "issue.blocker_updated",
          entityType: "Issue",
          entityId: issue.id,
          oldValue: auditJson({
            blockerCode: currentLink.blockerIssue.code,
            isBlockingUntilDone: currentLink.isBlockingUntilDone
          }),
          newValue: auditJson({
            blockerCode: currentLink.blockerIssue.code,
            isBlockingUntilDone: nextValue
          })
        }
      });

      return link;
    });

    return NextResponse.json(blockerLink);
  } catch (error) {
    return new NextResponse("No se pudo actualizar el bloqueo", {
      status: 400
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const blockerLinkId = searchParams.get("blockerLinkId");
    const issue = await getIssueContext(id);

    if (!issue) {
      return new NextResponse("Tarea no encontrada", { status: 404 });
    }

    if (!(await canCurrentUserEditIssue(currentUser.id, issue))) {
      return forbiddenResponse("Solo puedes modificar bloqueos de tareas asignadas a ti");
    }

    if (!blockerLinkId) {
      return new NextResponse("Selecciona el bloqueo que quieres quitar", {
        status: 400
      });
    }

    const currentLink = await prisma.issueBlocker.findFirst({
      where: {
        id: blockerLinkId,
        blockedIssueId: issue.id
      },
      include: {
        blockerIssue: {
          select: { code: true }
        }
      }
    });

    if (!currentLink) {
      return new NextResponse("Bloqueo no encontrado", { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.issueBlocker.delete({
        where: { id: currentLink.id }
      });

      await tx.auditLog.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          userId: currentUser.id,
          action: "issue.blocker_removed",
          entityType: "Issue",
          entityId: issue.id,
          oldValue: auditJson({
            blockerCode: currentLink.blockerIssue.code,
            isBlockingUntilDone: currentLink.isBlockingUntilDone
          }),
          newValue: auditJson(null)
        }
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return new NextResponse("No se pudo quitar el bloqueo", { status: 400 });
  }
}
