import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { issueCreateSchema } from "@/lib/schemas";
import { findFirstAssignableUserId, isAssignableUser } from "@/lib/users";

export const runtime = "nodejs";

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const payload = issueCreateSchema.parse(await request.json());

    const project = await prisma.project.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        _count: {
          select: {
            members: true
          }
        }
      }
    });

    if (!project || !project._count.members) {
      return new NextResponse("No hay proyecto o usuarios para crear tareas", {
        status: 400
      });
    }

    const access = await getCurrentUserAccess(currentUser.id, project.id);

    const fallbackUserId =
      (await findFirstAssignableUserId(project.id)) ?? currentUser.id;
    const parentIssue = payload.parentIssueId
      ? await prisma.issue.findFirst({
          where: {
            id: payload.parentIssueId,
            projectId: project.id
          },
          select: {
            id: true,
            parentIssueId: true,
            type: true,
            assigneeId: true,
            epicId: true,
            sprintId: true,
            startDate: true,
            dueDate: true
          }
        })
      : null;

    if (payload.parentIssueId && !parentIssue) {
      return new NextResponse("La tarea padre no existe", { status: 400 });
    }

    if (parentIssue?.parentIssueId || parentIssue?.type === "SUBTASK") {
      return new NextResponse(
        "No se pueden crear subtareas dentro de una subtarea",
        { status: 400 }
      );
    }

    if (!access.isAdmin && parentIssue && parentIssue.assigneeId !== currentUser.id) {
      return forbiddenResponse("Solo puedes crear subtareas en tareas asignadas a ti");
    }

    let assigneeId = access.isAdmin
      ? payload.assigneeId || parentIssue?.assigneeId || fallbackUserId
      : currentUser.id;

    if (
      assigneeId &&
      !payload.assigneeId &&
      !(await isAssignableUser(project.id, assigneeId))
    ) {
      assigneeId = fallbackUserId;
    }

    if (!(await isAssignableUser(project.id, assigneeId))) {
      return new NextResponse("El responsable no pertenece al grupo VPN", {
        status: 400
      });
    }

    const userId = currentUser.id;
    const sprintId = payload.sprintId || parentIssue?.sprintId || null;
    const epicId = payload.epicId || parentIssue?.epicId || null;
    const initialTimeSpent = payload.timeSpent ?? 0;
    const initialTimeRemaining =
      payload.estimate === null || payload.estimate === undefined
        ? null
        : Math.max(payload.estimate - initialTimeSpent, 0);
    const startDate = payload.startDate
      ? new Date(payload.startDate)
      : (parentIssue?.startDate ?? new Date());
    const dueDate = payload.dueDate
      ? new Date(payload.dueDate)
      : (parentIssue?.dueDate ?? addDays(startDate, 7));

    if (dueDate < startDate) {
      return new NextResponse(
        "La fecha de vencimiento no puede ser menor que la fecha de inicio",
        { status: 400 }
      );
    }

    const issue = await prisma.$transaction(async (tx) => {
      const counter = await tx.project.update({
        where: { id: project.id },
        data: {
          issueCounter: {
            increment: 1
          }
        },
        select: {
          issueCounter: true
        }
      });
      const code = `${project.key}-${String(counter.issueCounter).padStart(3, "0")}`;
      const lastIssue = await tx.issue.findFirst({
        where: {
          projectId: project.id,
          sprintId
        },
        orderBy: { position: "desc" },
        select: { position: true }
      });

      const createdIssue = await tx.issue.create({
        data: {
          projectId: project.id,
          sprintId,
          parentIssueId: parentIssue?.id ?? null,
          epicId,
          assigneeId,
          reporterId: currentUser.id,
          code,
          title: payload.title,
          description: payload.description || null,
          type: parentIssue ? "SUBTASK" : "TASK",
          status: payload.status,
          priority: payload.priority,
          estimate: payload.estimate ?? null,
          timeSpent: initialTimeSpent,
          timeRemaining: initialTimeRemaining,
          timeSpentDescription: payload.timeSpentDescription || null,
          startDate,
          dueDate,
          position: (lastIssue?.position ?? 0) + 1000
        },
        include: {
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
        }
      });

      if (initialTimeSpent > 0 && payload.timeSpentDescription?.trim()) {
        await tx.issueWorklog.create({
          data: {
            issueId: createdIssue.id,
            authorId: userId,
            timeSpent: initialTimeSpent,
            description: payload.timeSpentDescription
          }
        });
      }

      await tx.auditLog.create({
        data: {
          projectId: project.id,
          issueId: createdIssue.id,
          userId,
          action: "issue.created",
          entityType: "Issue",
          entityId: createdIssue.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            code: createdIssue.code,
            title: createdIssue.title,
            status: createdIssue.status,
            sprintId: createdIssue.sprintId,
            parentIssueId: createdIssue.parentIssueId,
            assigneeId: createdIssue.assigneeId,
            priority: createdIssue.priority,
            estimate: createdIssue.estimate,
            timeSpent: createdIssue.timeSpent,
            timeRemaining: createdIssue.timeRemaining,
            timeSpentDescription: createdIssue.timeSpentDescription,
            type: createdIssue.type,
            startDate: createdIssue.startDate,
            dueDate: createdIssue.dueDate
          })
        }
      });

      if (parentIssue) {
        await tx.auditLog.create({
          data: {
            projectId: project.id,
            issueId: parentIssue.id,
            userId,
            action: "issue.subtask_created",
            entityType: "Issue",
            entityId: parentIssue.id,
            oldValue: auditJson(null),
            newValue: auditJson({
              subtaskId: createdIssue.id,
              code: createdIssue.code,
              title: createdIssue.title
            })
          }
        });
      }

      return createdIssue;
    });

    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    console.error("Issue create failed", error);
    if (isDatabaseUnavailable(error)) {
      return databaseUnavailableResponse();
    }

    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message || "Los datos de la tarea no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse(
      error instanceof Error ? error.message : "No se pudo crear la tarea",
      { status: 400 }
    );
  }
}
