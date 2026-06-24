import { NextResponse } from "next/server";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { syncJiraProject } from "@/lib/jira-sync";
import { getCurrentUserAccess, getDefaultProject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

export async function POST() {
  try {
    const context = await requireAdminProject();
    if ("response" in context) return context.response;

    const config = await prisma.jiraMigrationConfig.findUnique({
      where: { projectId: context.project.id }
    });

    if (!config) {
      return new NextResponse("Primero guarda la configuracion de Jira", {
        status: 400
      });
    }

    const summary = await syncJiraProject({
      projectId: context.project.id,
      actorUserId: context.currentUser.id,
      config
    });

    return NextResponse.json({
      ok: true,
      ...summary,
      message: [
        `Sincronizacion completada: ${summary.fetchedIssues} tickets leidos desde Jira en ${summary.pages} paginas.`,
        `${summary.importedIssues} tareas/subtareas registradas (${summary.createdIssues} nuevas, ${summary.updatedIssues} actualizadas).`,
        `Tambien se sincronizaron ${summary.sprints} sprints, ${summary.epics} epicas, ${summary.worklogs} registros de tiempo y ${summary.blockers} bloqueos.`
      ].join(" ")
    });
  } catch (error) {
    console.error("Jira sync failed", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar la sincronizacion Jira"
      },
      { status: 500 }
    );
  }
}
