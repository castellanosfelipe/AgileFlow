import { SprintStatus } from "@prisma/client";
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
import { sprintCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = sprintCreateSchema.parse(await request.json());
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const project = await prisma.project.findFirst({
      orderBy: { createdAt: "asc" },
      include: {
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            userId: true
          }
        }
      }
    });

    if (!project) {
      return new NextResponse("No existe un proyecto para crear sprints", {
        status: 400
      });
    }

    if (!(await getCurrentUserAccess(currentUser.id, project.id)).isAdmin) {
      return forbiddenResponse();
    }

    const lastSprint = await prisma.sprint.findFirst({
      where: { projectId: project.id },
      orderBy: { position: "desc" }
    });
    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);
    const userId = currentUser.id;

    const sprint = await prisma.$transaction(async (tx) => {
      const createdSprint = await tx.sprint.create({
        data: {
          projectId: project.id,
          name: payload.name,
          status: SprintStatus.PLANNED,
          goal: payload.goal || null,
          startsAt,
          endsAt,
          position: (lastSprint?.position ?? 0) + 10
        }
      });

      await tx.auditLog.create({
        data: {
          projectId: project.id,
          userId,
          action: "sprint.created",
          entityType: "Sprint",
          entityId: createdSprint.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            name: createdSprint.name,
            status: createdSprint.status,
            startsAt: createdSprint.startsAt?.toISOString() ?? null,
            endsAt: createdSprint.endsAt?.toISOString() ?? null,
            goal: createdSprint.goal
          })
        }
      });

      return createdSprint;
    });

    return NextResponse.json(sprint, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return databaseUnavailableResponse();
    }

    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message ?? "Los datos del sprint no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo crear el sprint", { status: 400 });
  }
}
