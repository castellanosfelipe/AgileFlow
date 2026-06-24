import { NextResponse } from "next/server";
import { z } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserAccess, getDefaultProject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const defaultJql = "project = DES ORDER BY updated DESC";

const jiraMigrationSchema = z.object({
  jiraUrl: z.string().trim().url("Ingresa una URL valida de Jira"),
  jql: z.string().trim().min(3, "Ingresa el JQL de busqueda").max(5000),
  username: z.string().trim().min(1, "Ingresa el usuario o correo de Jira").max(180),
  token: z.string().trim().optional()
});

type JiraMigrationConfigRecord = {
  id: string;
  jiraUrl: string;
  jql: string;
  username: string;
  token?: string;
  createdAt: Date;
  lastTestedAt: Date | null;
  lastSyncedAt: Date | null;
};

function toResponse(config: JiraMigrationConfigRecord | null) {
  if (!config) {
    return {
      id: null,
      jiraUrl: "",
      jql: defaultJql,
      username: "",
      token: "",
      hasToken: false,
      createdAt: null,
      lastTestedAt: null,
      lastSyncedAt: null
    };
  }

  return {
    id: config.id,
    jiraUrl: config.jiraUrl,
    jql: config.jql,
    username: config.username,
    token: "",
    hasToken: Boolean(config.token),
    createdAt: config.createdAt.toISOString(),
    lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
    lastSyncedAt: config.lastSyncedAt?.toISOString() ?? null
  };
}

async function requireAdminProject() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return { response: unauthorizedResponse() };
  }

  const project = await getDefaultProject();
  if (!project) {
    return {
      response: new NextResponse("No hay proyecto configurado", { status: 400 })
    };
  }

  if (!(await getCurrentUserAccess(currentUser.id, project.id)).isAdmin) {
    return { response: forbiddenResponse() };
  }

  return { currentUser, project };
}

export async function GET() {
  try {
    const context = await requireAdminProject();
    if ("response" in context) return context.response;

    const config = await prisma.jiraMigrationConfig.findUnique({
      where: { projectId: context.project.id }
    });

    return NextResponse.json(toResponse(config));
  } catch (error) {
    return new NextResponse("No se pudo cargar la configuracion Jira", {
      status: 500
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdminProject();
    if ("response" in context) return context.response;

    const payload = jiraMigrationSchema.parse(await request.json());
    const savedConfig = await prisma.jiraMigrationConfig.findUnique({
      where: { projectId: context.project.id }
    });
    const token = payload.token?.trim() || savedConfig?.token;

    if (!token) {
      return new NextResponse("El token de Jira es obligatorio", {
        status: 400
      });
    }

    const data = {
      jiraUrl: payload.jiraUrl.replace(/\/+$/, ""),
      jql: payload.jql,
      username: payload.username,
      token
    };

    const config = savedConfig
      ? await prisma.jiraMigrationConfig.update({
          where: { id: savedConfig.id },
          data
        })
      : await prisma.jiraMigrationConfig.create({
          data: {
            ...data,
            projectId: context.project.id
          }
        });

    return NextResponse.json(toResponse(config));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Revisa los campos de migracion Jira", issues: error.flatten() },
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo guardar la configuracion Jira", {
      status: 500
    });
  }
}

export async function DELETE() {
  try {
    const context = await requireAdminProject();
    if ("response" in context) return context.response;

    await prisma.jiraMigrationConfig.deleteMany({
      where: { projectId: context.project.id }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return new NextResponse("No se pudo eliminar la configuracion Jira", {
      status: 500
    });
  }
}
