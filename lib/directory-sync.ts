import { ProjectRole } from "@prisma/client";

import { listLdapUsers } from "@/lib/ldap";
import { prisma } from "@/lib/prisma";

let lastSyncAttemptAt = 0;
let syncPromise: Promise<number> | null = null;
const syncIntervalMs = 5 * 60 * 1000;

export async function syncDirectoryUsers(projectId: string, force = false) {
  if (!force && Date.now() - lastSyncAttemptAt < syncIntervalMs) return 0;
  if (syncPromise) return syncPromise;

  lastSyncAttemptAt = Date.now();
  syncPromise = performDirectorySync(projectId).finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

async function performDirectorySync(projectId: string) {
  const ldapUsers = await listLdapUsers().catch(() => null);
  if (!ldapUsers) return 0;
  const syncedUserIds: string[] = [];

  for (const ldapUser of ldapUsers) {
    const user = await prisma.user.upsert({
      where: {
        email: ldapUser.email
      },
      create: {
        email: ldapUser.email,
        name: ldapUser.name,
        passwordHash: `ldap:${ldapUser.dn}`,
        isActive: true
      },
      update: {
        name: ldapUser.name,
        passwordHash: `ldap:${ldapUser.dn}`
      }
    });

    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id
        }
      },
      create: {
        projectId,
        userId: user.id,
        role: ProjectRole.MEMBER
      },
      update: {}
    });

    syncedUserIds.push(user.id);
  }

  if (syncedUserIds.length) {
    await prisma.projectMember.deleteMany({
      where: {
        projectId,
        userId: {
          notIn: syncedUserIds
        },
        user: {
          passwordHash: {
            startsWith: "ldap:"
          }
        }
      }
    });
  }

  return syncedUserIds.length;
}
