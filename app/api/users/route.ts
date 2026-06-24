import { Prisma, ProjectRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  forbiddenResponse,
  unauthorizedResponse
} from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import {
  getCurrentUserAccess,
  getDefaultProject,
  toAppRole,
  toProjectRole
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  userCreateSchema,
  userDeleteSchema,
  userRoleUpdateSchema
} from "@/lib/schemas";

export const runtime = "nodejs";

const managedUserSelect = {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
        name: true,
        email: true,
        image: true,
        passwordHash: true,
        isActive: true
      }
  }
} satisfies Prisma.ProjectMemberSelect;

type ManagedUserMembership = Prisma.ProjectMemberGetPayload<{
  select: typeof managedUserSelect;
}>;

function toManagedUser(membership: ManagedUserMembership) {
  const user = membership.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    isActive: user.isActive,
    role: toAppRole(membership.role),
    source: user.passwordHash.startsWith("ldap:") ? "ldap" : "local"
  };
}

async function requireAdminProject() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) return { error: unauthorizedResponse() };

  const project = await getDefaultProject();
  if (!project) {
    return {
      error: new NextResponse("No hay proyecto activo", { status: 400 })
    };
  }

  const access = await getCurrentUserAccess(currentUser.id, project.id);
  if (!access.isAdmin) return { error: forbiddenResponse() };

  return { currentUser, project };
}

async function countAdmins(projectId: string) {
  return prisma.projectMember.count({
    where: {
      projectId,
      role: {
        in: [ProjectRole.OWNER, ProjectRole.ADMIN]
      },
      user: {
        isActive: true
      }
    }
  });
}

export async function GET() {
  try {
    const context = await requireAdminProject();
    if (context.error) return context.error;

    const memberships = await prisma.projectMember.findMany({
      where: { projectId: context.project.id },
      select: managedUserSelect,
      orderBy: {
        user: {
          name: "asc"
        }
      }
    });

    return NextResponse.json({
      currentUserId: context.currentUser.id,
      users: memberships.map(toManagedUser)
    });
  } catch (error) {
    return new NextResponse("No se pudieron cargar los usuarios", {
      status: 500
    });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdminProject();
    if (context.error) return context.error;

    const payload = userCreateSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(payload.password, 10);

    const membership = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: payload.email.toLowerCase() },
        create: {
          name: payload.name,
          email: payload.email.toLowerCase(),
          passwordHash,
          isActive: true
        },
        update: {
          name: payload.name,
          passwordHash,
          isActive: true
        }
      });

      return tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: context.project.id,
            userId: user.id
          }
        },
        create: {
          projectId: context.project.id,
          userId: user.id,
          role: toProjectRole(payload.role)
        },
        update: {
          role: toProjectRole(payload.role)
        },
        select: managedUserSelect
      });
    });

    return NextResponse.json(toManagedUser(membership), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message || "Los datos del usuario no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo crear el usuario", { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdminProject();
    if (context.error) return context.error;

    const payload = userRoleUpdateSchema.parse(await request.json());
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: context.project.id,
          userId: payload.userId
        }
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            isActive: true
          }
        }
      }
    });

    if (!membership) {
      return new NextResponse("Usuario no encontrado", { status: 404 });
    }

    const isCurrentActiveAdmin =
      toAppRole(membership.role) === "admin" && membership.user.isActive;

    if (
      isCurrentActiveAdmin &&
      (payload.role === "user" || payload.isActive === false)
    ) {
      const admins = await countAdmins(context.project.id);
      if (admins <= 1) {
        return new NextResponse("Debe existir al menos un admin", {
          status: 409
        });
      }
    }

    if (payload.isActive === false && payload.userId === context.currentUser.id) {
      return new NextResponse("No puedes inactivar tu propio usuario", {
        status: 409
      });
    }

    const updatedMembership = await prisma.$transaction(async (tx) => {
      if (payload.isActive !== undefined) {
        await tx.user.update({
          where: { id: payload.userId },
          data: {
            isActive: payload.isActive
          }
        });
      }

      if (payload.role) {
        await tx.projectMember.update({
          where: { id: membership.id },
          data: {
            role: toProjectRole(payload.role)
          }
        });
      }

      return tx.projectMember.findUniqueOrThrow({
        where: { id: membership.id },
        select: managedUserSelect
      });
    });

    return NextResponse.json(toManagedUser(updatedMembership));
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message || "Los datos del rol no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo actualizar el rol", { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireAdminProject();
    if (context.error) return context.error;

    const { searchParams } = new URL(request.url);
    const payload = userDeleteSchema.parse({
      userId: searchParams.get("userId")
    });

    if (payload.userId === context.currentUser.id) {
      return new NextResponse("No puedes eliminar tu propio usuario", {
        status: 409
      });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: context.project.id,
          userId: payload.userId
        }
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            passwordHash: true,
            isActive: true
          }
        }
      }
    });

    if (!membership) {
      return new NextResponse("Usuario no encontrado", { status: 404 });
    }

    if (membership.user.passwordHash.startsWith("ldap:")) {
      return new NextResponse(
        "Solo se pueden eliminar usuarios locales. Para usuarios del Directorio Activo usa inactivar.",
        { status: 409 }
      );
    }

    if (
      toAppRole(membership.role) === "admin" &&
      membership.user.isActive &&
      (await countAdmins(context.project.id)) <= 1
    ) {
      return new NextResponse("Debe existir al menos un admin", {
        status: 409
      });
    }

    const [
      assignedIssues,
      reportedIssues,
      comments,
      attachments,
      worklogs,
      auditLogs
    ] = await Promise.all([
      prisma.issue.count({ where: { assigneeId: payload.userId } }),
      prisma.issue.count({ where: { reporterId: payload.userId } }),
      prisma.issueComment.count({ where: { authorId: payload.userId } }),
      prisma.issueAttachment.count({ where: { uploaderId: payload.userId } }),
      prisma.issueWorklog.count({ where: { authorId: payload.userId } }),
      prisma.auditLog.count({ where: { userId: payload.userId } })
    ]);

    if (
      assignedIssues ||
      reportedIssues ||
      comments ||
      attachments ||
      worklogs ||
      auditLogs
    ) {
      return new NextResponse(
        "Este usuario ya tiene historial o tareas asociadas. Inactívalo para quitarle el acceso sin perder trazabilidad.",
        { status: 409 }
      );
    }

    await prisma.user.delete({
      where: {
        id: payload.userId
      }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message || "Los datos del usuario no son válidos",
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo eliminar el usuario", { status: 400 });
  }
}
