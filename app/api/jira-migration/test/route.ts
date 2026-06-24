import { NextResponse } from "next/server";
import { z } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserAccess, getDefaultProject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const testSchema = z.object({
  jiraUrl: z.string().trim().url("Ingresa una URL valida de Jira"),
  jql: z.string().trim().min(3, "Ingresa el JQL de busqueda"),
  username: z.string().trim().min(1, "Ingresa el usuario o correo de Jira"),
  token: z.string().trim().optional()
});

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

  return { project };
}

function basicAuth(username: string, token: string) {
  return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
}

async function getJiraErrorMessage(response: Response) {
  const body = await response.text();

  try {
    const parsed = JSON.parse(body) as {
      errorMessages?: string[];
      errors?: Record<string, string>;
      message?: string;
    };
    const messages = [
      ...(parsed.errorMessages ?? []),
      ...Object.values(parsed.errors ?? {}),
      parsed.message
    ].filter(Boolean);

    if (messages.length) return messages.join(" ");
  } catch {
    // Jira sometimes returns plain text or HTML depending on the failure.
  }

  return body || `Jira respondio ${response.status}.`;
}

export async function POST(request: Request) {
  try {
    const context = await requireAdminProject();
    if ("response" in context) return context.response;

    const payload = testSchema.parse(await request.json());
    const savedConfig = await prisma.jiraMigrationConfig.findUnique({
      where: { projectId: context.project.id }
    });
    const token = payload.token?.trim() || savedConfig?.token;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "El token de Jira es obligatorio para probar" },
        { status: 400 }
      );
    }

    const jiraUrl = payload.jiraUrl.replace(/\/+$/, "");
    const authHeader = basicAuth(payload.username, token);
    const myselfResponse = await fetch(`${jiraUrl}/rest/api/3/myself`, {
      headers: {
        Accept: "application/json",
        Authorization: authHeader
      }
    });

    if (!myselfResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: `Jira respondio ${myselfResponse.status}. Revisa URL, usuario o token.`
        },
        { status: 400 }
      );
    }

    const searchUrl = new URL(`${jiraUrl}/rest/api/3/search/jql`);
    searchUrl.searchParams.set("jql", payload.jql);
    searchUrl.searchParams.set("maxResults", "1");
    searchUrl.searchParams.set("fields", "key");

    const searchResponse = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        Authorization: authHeader
      }
    });

    if (!searchResponse.ok) {
      const errorMessage = await getJiraErrorMessage(searchResponse);
      return NextResponse.json(
        {
          ok: false,
          message:
            errorMessage ||
            `La autenticacion funciona, pero el JQL respondio ${searchResponse.status}.`
        },
        { status: 400 }
      );
    }

    await prisma.jiraMigrationConfig.updateMany({
      where: { projectId: context.project.id },
      data: { lastTestedAt: new Date() }
    });

    const searchData = (await searchResponse.json().catch(() => ({}))) as {
      issues?: unknown[];
      isLast?: boolean;
    };
    const sampledIssues = searchData.issues?.length ?? 0;
    const resultText =
      sampledIssues > 0
        ? "El JQL es valido y Jira devolvio tickets en la primera pagina."
        : searchData.isLast
          ? "El JQL es valido, pero no devolvio tickets."
          : "El JQL es valido.";

    return NextResponse.json({
      ok: true,
      sampledIssues,
      message: `Conexion activa. ${resultText}`
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Revisa los campos de migracion Jira"
        : error instanceof Error
          ? error.message
          : "No se pudo probar la conexion Jira";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
