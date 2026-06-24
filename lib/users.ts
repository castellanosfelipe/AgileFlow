import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function assignableUserWhere(
  projectId: string
): Promise<Prisma.UserWhereInput> {
  const where: Prisma.UserWhereInput = {
    isActive: true,
    memberships: {
      some: {
        projectId
      }
    }
  };

  return where;
}

export async function findFirstAssignableUserId(projectId: string) {
  const user = await prisma.user.findFirst({
    where: await assignableUserWhere(projectId),
    orderBy: { name: "asc" },
    select: { id: true }
  });

  return user?.id ?? null;
}

export async function isAssignableUser(projectId: string, userId: string) {
  const count = await prisma.user.count({
    where: {
      ...(await assignableUserWhere(projectId)),
      id: userId
    }
  });

  return count > 0;
}
