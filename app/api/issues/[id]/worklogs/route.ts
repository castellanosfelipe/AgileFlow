import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditAssignedIssue,
  getCurrentUserAccess
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { issueWorklogCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const payload = issueWorklogCreateSchema.parse(await request.json());

    const currentIssue = await prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
        estimate: true,
        timeSpent: true,
        timeRemaining: true
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
      return forbiddenResponse("Solo puedes registrar tiempo en tareas asignadas a ti");
    }

    const nextTimeSpent = currentIssue.timeSpent + payload.timeSpent;
    const nextTimeRemaining =
      currentIssue.estimate === null
        ? null
        : Math.max(currentIssue.estimate - nextTimeSpent, 0);

    const worklog = await prisma.$transaction(async (tx) => {
      const createdWorklog = await tx.issueWorklog.create({
        data: {
          issueId: currentIssue.id,
          authorId: currentUser.id,
          timeSpent: payload.timeSpent,
          description: payload.description
        },
        include: {
          author: {
            select: userSelect
          }
        }
      });

      await tx.issue.update({
        where: { id: currentIssue.id },
        data: {
          timeSpent: nextTimeSpent,
          timeRemaining: nextTimeRemaining,
          timeSpentDescription: payload.description
        }
      });

      await tx.auditLog.create({
        data: {
          projectId: currentIssue.projectId,
          issueId: currentIssue.id,
          userId: currentUser.id,
          action: "issue.time_logged",
          entityType: "Issue",
          entityId: currentIssue.id,
          oldValue: auditJson({
            timeSpent: currentIssue.timeSpent,
            timeRemaining: currentIssue.timeRemaining
          }),
          newValue: auditJson({
            loggedTime: payload.timeSpent,
            description: payload.description,
            timeSpent: nextTimeSpent,
            timeRemaining: nextTimeRemaining
          })
        }
      });

      return createdWorklog;
    });

    return NextResponse.json({
      worklog,
      timeSpent: nextTimeSpent,
      timeRemaining: nextTimeRemaining
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message || "Los datos del tiempo no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse(
      error instanceof Error ? error.message : "No se pudo registrar el tiempo",
      { status: 400 }
    );
  }
}
