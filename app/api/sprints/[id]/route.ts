import { SprintStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sprintActionSchema } from "@/lib/schemas";
import {
  CompleteSprintError,
  completeSprint
} from "@/lib/sprints/complete-sprint";
import { StartSprintError, startSprint } from "@/lib/sprints/start-sprint";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const payload = sprintActionSchema.parse(await request.json());
    const sprint = await prisma.sprint.findUnique({ where: { id } });

    if (!sprint) {
      return new NextResponse("Sprint no encontrado", { status: 404 });
    }

    if (!(await getCurrentUserAccess(currentUser.id, sprint.projectId)).isAdmin) {
      return forbiddenResponse();
    }

    const userId = currentUser.id;

    if (payload.action === "start") {
      const updatedSprint = await prisma.$transaction((tx) =>
        startSprint(id, {
          findSprintById: (sprintId) =>
            tx.sprint.findUnique({ where: { id: sprintId } }),
          findActiveSprintByProject: (projectId, excludeSprintId) =>
            tx.sprint.findFirst({
              where: {
                projectId,
                status: SprintStatus.ACTIVE,
                NOT: { id: excludeSprintId }
              }
            }),
          updateSprintToActive: (sprintId, projectId, startsAt) =>
            tx.sprint.update({
              where: { id: sprintId },
              data: {
                status: SprintStatus.ACTIVE,
                activeProjectId: projectId,
                startsAt
              }
            }),
          createAuditLog: (input) =>
            tx.auditLog.create({
              data: {
                projectId: input.projectId,
                userId,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                oldValue: auditJson(input.oldValue),
                newValue: auditJson(input.newValue)
              }
            })
        })
      );

      return NextResponse.json(updatedSprint);
    }

    const updatedSprint = await prisma.$transaction((tx) =>
      completeSprint(
        id,
        payload.movePendingTo === "backlog"
          ? { type: "backlog" }
          : { type: "sprint", sprintId: payload.targetSprintId ?? "" },
        {
          findSprintById: (sprintId) =>
            tx.sprint.findUnique({ where: { id: sprintId } }),
          findPlannedSprintById: (sprintId, projectId) =>
            tx.sprint.findFirst({
              where: {
                id: sprintId,
                projectId,
                status: SprintStatus.PLANNED
              }
            }),
          movePendingIssues: async ({ fromSprintId, toSprintId }) => {
            const pendingIssues = await tx.issue.findMany({
              where: {
                sprintId: fromSprintId,
                status: { not: "DONE" }
              },
              select: {
                id: true,
                projectId: true,
                sprintId: true
              }
            });
            const result = await tx.issue.updateMany({
              where: {
                sprintId: fromSprintId,
                status: { not: "DONE" }
              },
              data: {
                sprintId: toSprintId
              }
            });

            if (pendingIssues.length) {
              await tx.auditLog.createMany({
                data: pendingIssues.map((issue) => ({
                  projectId: issue.projectId,
                  issueId: issue.id,
                  userId,
                  action: "issue.moved",
                  entityType: "Issue",
                  entityId: issue.id,
                  oldValue: auditJson({ sprintId: issue.sprintId }),
                  newValue: auditJson({ sprintId: toSprintId })
                }))
              });
            }

            return result.count;
          },
          updateSprintToCompleted: (sprintId, completedAt) =>
            tx.sprint.update({
              where: { id: sprintId },
              data: {
                status: SprintStatus.COMPLETED,
                activeProjectId: null,
                endsAt: completedAt
              }
            }),
          createAuditLog: (input) =>
            tx.auditLog.create({
              data: {
                projectId: input.projectId,
                userId,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                oldValue: auditJson(input.oldValue),
                newValue: auditJson(input.newValue)
              }
            })
        }
      )
    );

    return NextResponse.json(updatedSprint);
  } catch (error) {
    if (error instanceof StartSprintError) {
      const status =
        error.code === "SPRINT_NOT_FOUND"
          ? 404
          : error.code === "ACTIVE_SPRINT_EXISTS"
            ? 409
            : 400;

      return new NextResponse(error.message, { status });
    }

    if (error instanceof CompleteSprintError) {
      const status =
        error.code === "SPRINT_NOT_FOUND"
          ? 404
          : error.code === "TARGET_SPRINT_NOT_PLANNED"
            ? 400
            : 400;

      return new NextResponse(error.message, { status });
    }

    return new NextResponse("No se pudo actualizar el sprint", { status: 400 });
  }
}
