import { Prisma, SprintStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { auditJson, serializeAuditValue } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditAssignedIssue,
  getCurrentUserAccess
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { issueUpdateSchema } from "@/lib/schemas";
import { isAssignableUser } from "@/lib/users";

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

const epicSelect = {
  id: true,
  key: true,
  name: true,
  color: true
} satisfies Prisma.EpicSelect;

const issueSummarySelect = {
  id: true,
  code: true,
  title: true,
  type: true,
  status: true,
  estimate: true,
  startDate: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: userSelect
  }
} satisfies Prisma.IssueSelect;

const issueDetailInclude = {
  assignee: {
    select: userSelect
  },
  reporter: {
    select: userSelect
  },
  epic: {
    select: epicSelect
  },
  parentIssue: {
    select: issueSummarySelect
  },
  blockedByIssue: {
    select: issueSummarySelect
  },
  blockers: {
    include: {
      blockerIssue: {
        select: issueSummarySelect
      }
    },
    orderBy: { createdAt: "asc" }
  },
  subtasks: {
    select: issueSummarySelect,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }]
  },
  labels: {
    select: {
      id: true,
      name: true,
      color: true
    },
    orderBy: { name: "asc" }
  },
  comments: {
    include: {
      author: {
        select: userSelect
      }
    },
    orderBy: { createdAt: "asc" }
  },
  attachments: {
    include: {
      uploader: {
        select: userSelect
      }
    },
    orderBy: { createdAt: "desc" }
  },
  worklogs: {
    include: {
      author: {
        select: userSelect
      }
    },
    orderBy: { createdAt: "desc" }
  },
  auditLogs: {
    include: {
      user: {
        select: userSelect
      }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  }
} satisfies Prisma.IssueInclude;

type AuditEntry = {
  action: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
};

function addAuditEntry(
  entries: AuditEntry[],
  action: string,
  field: string,
  from: Date | string | number | boolean | null | undefined,
  to: Date | string | number | boolean | null | undefined
) {
  const previous = serializeAuditValue(from);
  const next = serializeAuditValue(to);

  if (previous !== next) {
    entries.push({
      action,
      oldValue: {
        [field]: previous
      },
      newValue: {
        [field]: next
      }
    });
  }
}

function parseRequiredDate(value: string | null | undefined) {
  if (!value) return null;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: issueDetailInclude
    });

    if (!issue) {
      return new NextResponse("Issue no encontrado", { status: 404 });
    }

    return NextResponse.json(issue);
  } catch (error) {
    return new NextResponse("No se pudo cargar la tarea", { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const body = await request.json();
    const payload = issueUpdateSchema.parse(body);

    const currentIssue = await prisma.issue.findUnique({
      where: { id },
      include: {
        sprint: {
          select: {
            status: true
          }
        },
        blockedByIssue: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            sprintId: true,
            blockedByIssueId: true
          }
        },
        blockers: {
          include: {
            blockerIssue: {
              select: {
                id: true,
                code: true,
                title: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!currentIssue) {
      return new NextResponse("Issue no encontrado", { status: 404 });
    }

    const access = await getCurrentUserAccess(
      currentUser.id,
      currentIssue.projectId
    );

    if (
      !canEditAssignedIssue({
        currentUserId: currentUser.id,
        isAdmin: access.isAdmin,
        assigneeId: currentIssue.assigneeId
      })
    ) {
      return forbiddenResponse("Solo puedes editar tareas asignadas a ti");
    }

    if (
      !access.isAdmin &&
      "assigneeId" in body &&
      payload.assigneeId &&
      payload.assigneeId !== currentIssue.assigneeId
    ) {
      return forbiddenResponse("No puedes reasignar tareas con rol user");
    }

    const userId = currentUser.id;
    const isMoveOrStatusChange =
      "status" in body || "position" in body || "sprintId" in body;

    if (isMoveOrStatusChange && currentIssue.sprint?.status === "COMPLETED") {
      return new NextResponse(
        "No se pueden mover tareas de un sprint completado",
        { status: 409 }
      );
    }

    const data: Prisma.IssueUncheckedUpdateInput = {};
    const auditEntries: AuditEntry[] = [];
    const nextSprintId =
      "sprintId" in body ? payload.sprintId || null : currentIssue.sprintId;
    const isSprintChanging = nextSprintId !== currentIssue.sprintId;

    if ("title" in body) {
      data.title = payload.title;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "title",
        currentIssue.title,
        payload.title
      );
    }
    if ("description" in body) {
      const description = payload.description || null;
      data.description = description;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "description",
        currentIssue.description,
        description
      );
    }
    if ("type" in body) {
      data.type = payload.type;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "type",
        currentIssue.type,
        payload.type
      );
    }
    if ("status" in body) {
      const activeTotalBlocker = currentIssue.blockers.find(
        (blocker) =>
          blocker.isBlockingUntilDone && blocker.blockerIssue.status !== "DONE"
      );

      if (activeTotalBlocker && payload.status !== "TODO") {
        return new NextResponse(
          `Esta tarea está bloqueada por ${activeTotalBlocker.blockerIssue.code}. Primero finaliza esa tarea.`,
          { status: 409 }
        );
      }

      data.status = payload.status;
      addAuditEntry(
        auditEntries,
        "issue.status_changed",
        "status",
        currentIssue.status,
        payload.status
      );
    }
    if ("priority" in body) {
      data.priority = payload.priority;
      addAuditEntry(
        auditEntries,
        "issue.priority_changed",
        "priority",
        currentIssue.priority,
        payload.priority
      );
    }
    if ("estimate" in body) {
      data.estimate = payload.estimate ?? null;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "estimate",
        currentIssue.estimate,
        payload.estimate ?? null
      );
    }
    if ("timeSpent" in body) {
      data.timeSpent = payload.timeSpent ?? 0;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "timeSpent",
        currentIssue.timeSpent,
        payload.timeSpent ?? 0
      );
    }
    if ("timeRemaining" in body) {
      data.timeRemaining = payload.timeRemaining ?? null;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "timeRemaining",
        currentIssue.timeRemaining,
        payload.timeRemaining ?? null
      );
    }
    if ("timeSpentDescription" in body) {
      const timeSpentDescription = payload.timeSpentDescription || null;
      data.timeSpentDescription = timeSpentDescription;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "timeSpentDescription",
        currentIssue.timeSpentDescription,
        timeSpentDescription
      );
    }
    if ("startDate" in body) {
      const startDate = parseRequiredDate(payload.startDate);
      if (!startDate) {
        return new NextResponse("La fecha de inicio es obligatoria", {
          status: 400
        });
      }

      data.startDate = startDate;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "startDate",
        currentIssue.startDate,
        startDate
      );
    }
    if ("dueDate" in body) {
      const dueDate = parseRequiredDate(payload.dueDate);
      if (!dueDate) {
        return new NextResponse("La fecha de vencimiento es obligatoria", {
          status: 400
        });
      }

      data.dueDate = dueDate;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "dueDate",
        currentIssue.dueDate,
        dueDate
      );
    }
    if ("sprintId" in body) {
      const sprintId = payload.sprintId || null;
      if (sprintId) {
        const targetSprint = await prisma.sprint.findFirst({
          where: {
            id: sprintId,
            projectId: currentIssue.projectId
          },
          select: {
            status: true
          }
        });

        if (!targetSprint) {
          return new NextResponse("El sprint seleccionado no existe", {
            status: 400
          });
        }

        if (targetSprint.status === SprintStatus.COMPLETED) {
          return new NextResponse(
            "No se pueden mover tareas a un sprint completado",
            { status: 409 }
          );
        }
      }

      data.sprintId = sprintId;
      if (
        isSprintChanging &&
        (currentIssue.blockedByIssueId || currentIssue.blockers.length)
      ) {
        data.blockedByIssueId = null;
        data.isBlockedUntilDone = false;
        addAuditEntry(
          auditEntries,
          "issue.blocker_changed",
          "blockedByIssueId",
          currentIssue.blockers
            .map((blocker) => blocker.blockerIssue.code)
            .join(", ") || currentIssue.blockedByIssue?.code,
          null
        );
      }
      addAuditEntry(
        auditEntries,
        "issue.moved",
        "sprintId",
        currentIssue.sprintId,
        sprintId
      );
    }
    if ("assigneeId" in body && payload.assigneeId) {
      if (!(await isAssignableUser(currentIssue.projectId, payload.assigneeId))) {
        return new NextResponse("El responsable no pertenece al grupo VPN", {
          status: 400
        });
      }

      data.assigneeId = payload.assigneeId;
      addAuditEntry(
        auditEntries,
        "issue.assignee_changed",
        "assigneeId",
        currentIssue.assigneeId,
        payload.assigneeId
      );
    }
    if ("epicId" in body) {
      const epicId = payload.epicId || null;
      data.epicId = epicId;
      addAuditEntry(
        auditEntries,
        "issue.updated",
        "epicId",
        currentIssue.epicId,
        epicId
      );
    }
    if ("blockedByIssueId" in body) {
      const blockedByIssueId = payload.blockedByIssueId || null;

      if (blockedByIssueId === currentIssue.id) {
        return new NextResponse("Una tarea no se puede bloquear a sí misma", {
          status: 400
        });
      }

      let blocker:
        | {
            id: string;
            code: string;
            sprintId: string | null;
            blockedByIssueId: string | null;
          }
        | null = null;

      if (blockedByIssueId) {
        if (!currentIssue.sprintId) {
          return new NextResponse(
            "La tarea debe estar dentro de un sprint para agregar un bloqueo",
            { status: 400 }
          );
        }

        blocker = await prisma.issue.findFirst({
          where: {
            id: blockedByIssueId,
            projectId: currentIssue.projectId,
            sprintId: currentIssue.sprintId
          },
          select: {
            id: true,
            code: true,
            sprintId: true,
            blockedByIssueId: true
          }
        });

        if (!blocker) {
          return new NextResponse(
            "Selecciona una tarea o subtarea del mismo sprint",
            { status: 400 }
          );
        }

        if (blocker.blockedByIssueId === currentIssue.id) {
          return new NextResponse(
            "Ese bloqueo crearía una dependencia circular",
            { status: 400 }
          );
        }
      }

      data.blockedByIssueId = blockedByIssueId;
      if (!blockedByIssueId) data.isBlockedUntilDone = false;
      addAuditEntry(
        auditEntries,
        "issue.blocker_changed",
        "blockedByIssueId",
        currentIssue.blockedByIssue?.code,
        blocker?.code ?? null
      );
    }
    if ("isBlockedUntilDone" in body) {
      const nextBlockedByIssueId =
        "blockedByIssueId" in body
          ? payload.blockedByIssueId || null
          : currentIssue.blockedByIssueId;

      if (payload.isBlockedUntilDone && !nextBlockedByIssueId) {
        return new NextResponse(
          "Primero selecciona la tarea o subtarea que bloquea",
          { status: 400 }
        );
      }

      data.isBlockedUntilDone = Boolean(payload.isBlockedUntilDone);
      addAuditEntry(
        auditEntries,
        "issue.blocker_changed",
        "isBlockedUntilDone",
        currentIssue.isBlockedUntilDone,
        Boolean(payload.isBlockedUntilDone)
      );
    }
    if ("position" in body) data.position = payload.position;

    const nextStartDate =
      data.startDate instanceof Date ? data.startDate : currentIssue.startDate;
    const nextDueDate =
      data.dueDate instanceof Date ? data.dueDate : currentIssue.dueDate;

    if (("startDate" in body || "dueDate" in body) && nextDueDate < nextStartDate) {
      return new NextResponse(
        "La fecha de vencimiento no puede ser menor que la fecha de inicio",
        { status: 400 }
      );
    }

    const issue = await prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id },
        data
      });

      if (isSprintChanging) {
        await tx.issueBlocker.deleteMany({
          where: {
            OR: [
              { blockedIssueId: currentIssue.id },
              { blockerIssueId: currentIssue.id }
            ]
          }
        });
      }

      if (auditEntries.length) {
        await tx.auditLog.createMany({
          data: auditEntries.map((entry) => ({
            projectId: currentIssue.projectId,
            issueId: currentIssue.id,
            userId,
            action: entry.action,
            entityType: "Issue",
            entityId: currentIssue.id,
            oldValue: auditJson(entry.oldValue),
            newValue: auditJson(entry.newValue)
          }))
        });
      }

      return tx.issue.findUniqueOrThrow({
        where: { id },
        include: issueDetailInclude
      });
    });

    return NextResponse.json(issue);
  } catch (error) {
    console.error("Issue update failed", error);
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message ?? "Los datos de la tarea no son válidos",
        { status: 400 }
      );
    }
    return new NextResponse("No se pudo actualizar la tarea", { status: 400 });
  }
}
