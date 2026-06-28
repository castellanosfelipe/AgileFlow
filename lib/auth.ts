import { ProjectRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { authenticateWithLdap, isLdapConfigured } from "@/lib/ldap";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clearFailures, isRateLimitOk, recordFailure } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

// Throttle credential stuffing / brute force: max failed attempts per username
// within the window. Successful logins reset the counter.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

async function ensureProjectMembership(userId: string) {
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true
    }
  });

  if (!project) return;

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId
      }
    },
    create: {
      projectId: project.id,
      userId,
      role: ProjectRole.MEMBER
    },
    update: {}
  });
}

async function authorizeWithLdap(username: string, password: string) {
  const ldapUser = await authenticateWithLdap(username, password);
  if (!ldapUser) return null;

  const existingUser = await prisma.user.findUnique({
    where: {
      email: ldapUser.email
    },
    select: {
      isActive: true
    }
  });

  if (existingUser && !existingUser.isActive) return null;

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
      name: ldapUser.name
    }
  });

  await ensureProjectMembership(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image
  };
}

async function authorizeWithLocalUser(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: username }
  });

  if (!user) return null;
  if (!user.isActive) return null;

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  providers: [
    CredentialsProvider({
      name: "Directorio activo",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contrasena", type: "password" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;
        const rateKey = `login:${username.toLowerCase()}`;

        if (!isRateLimitOk(rateKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS)) {
          return null;
        }

        let user = null;
        if (await isLdapConfigured()) {
          user = await authorizeWithLdap(username, password);
        }
        if (!user) {
          user = await authorizeWithLocalUser(username, password);
        }

        if (user) {
          clearFailures(rateKey);
          return user;
        }

        recordFailure(rateKey, LOGIN_WINDOW_MS);
        return null;
      }
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
        const access = await getCurrentUserAccess(session.user.id);
        session.user.role = access.appRole;
      }
      return session;
    }
  }
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      isActive: true
    }
  });

  if (!user?.isActive) return null;

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
