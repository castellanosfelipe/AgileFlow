import { ProjectRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AppRole = "admin" | "user";

export function toAppRole(role?: ProjectRole | null): AppRole {
  return role === ProjectRole.ADMIN || role === ProjectRole.OWNER
    ? "admin"
    : "user";
}

export function toProjectRole(role: AppRole) {
  return role === "admin" ? ProjectRole.ADMIN : ProjectRole.MEMBER;
}

export async function getDefaultProject() {
  return prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      key: true,
      name: true
    }
  });
}

export async function getUserProjectRole(userId: string, projectId?: string) {
  const project = projectId
    ? { id: projectId }
    : await prisma.project.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true }
      });

  if (!project) return null;

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId
      }
    },
    select: {
      role: true
    }
  });

  return membership?.role ?? null;
}

export async function getCurrentUserAccess(userId: string, projectId?: string) {
  const role = await getUserProjectRole(userId, projectId);
  const appRole = toAppRole(role);

  return {
    role,
    appRole,
    isAdmin: appRole === "admin"
  };
}

export async function isProjectAdmin(userId: string, projectId?: string) {
  const access = await getCurrentUserAccess(userId, projectId);
  return access.isAdmin;
}

export function canEditAssignedIssue({
  currentUserId,
  isAdmin,
  assigneeId
}: {
  currentUserId: string;
  isAdmin: boolean;
  assigneeId: string;
}) {
  return isAdmin || assigneeId === currentUserId;
}
