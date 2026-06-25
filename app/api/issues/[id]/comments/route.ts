import { Prisma } from "@prisma/client";
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
import { issueCommentCreateSchema } from "@/lib/schemas";

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

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const payload = issueCommentCreateSchema.parse(await request.json());
    const issue = await prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
        reporterId: true
      }
    });

    if (!issue) {
      return new NextResponse("Issue no encontrado", { status: 404 });
    }

    const access = await getCurrentUserAccess(currentUser.id, issue.projectId);
    if (
      !canEditAssignedIssue({
        currentUserId: currentUser.id,
        isAdmin: access.isAdmin,
        assigneeId: issue.assigneeId
      })
    ) {
      return forbiddenResponse("Solo puedes comentar tareas asignadas a ti");
    }

    const userId = currentUser.id;

    const comment = await prisma.$transaction(async (tx) => {
      const createdComment = await tx.issueComment.create({
        data: {
          issueId: issue.id,
          authorId: userId,
          body: payload.body
        },
        include: {
          author: {
            select: userSelect
          }
        }
      });

      await tx.auditLog.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          userId,
          action: "issue.commented",
          entityType: "Issue",
          entityId: issue.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            commentId: createdComment.id
          })
        }
      });

      return createdComment;
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message ?? "El comentario no es válido",
        { status: 400 }
      );
    }
    return new NextResponse("No se pudo agregar el comentario", { status: 400 });
  }
}
