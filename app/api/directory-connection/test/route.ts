import { NextResponse } from "next/server";
import { z } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLdapConfig, testLdapConnection } from "@/lib/ldap";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const testSchema = z.object({
  name: z.string().trim().min(1),
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  bindDn: z.string().trim().min(1),
  bindPassword: z.string().optional(),
  baseDn: z.string().trim().min(1),
  userFilter: z.string().trim().min(1),
  loginAttribute: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();
    if (!(await getCurrentUserAccess(currentUser.id)).isAdmin) {
      return forbiddenResponse();
    }

    const payload = testSchema.parse(await request.json());
    const savedConfig = await prisma.directoryConnection.findFirst({
      orderBy: { createdAt: "asc" }
    });
    const activeConfig = savedConfig ? null : await getActiveLdapConfig();
    const bindPassword =
      payload.bindPassword?.trim() ||
      savedConfig?.bindPassword ||
      activeConfig?.bindPassword;

    if (!bindPassword) {
      return new NextResponse("La contraseña es obligatoria para probar", {
        status: 400
      });
    }

    const result = await testLdapConnection({
      name: payload.name,
      host: payload.host,
      port: payload.port,
      bindDn: payload.bindDn,
      bindPassword,
      baseDn: payload.baseDn,
      userFilter: payload.userFilter,
      loginAttribute: payload.loginAttribute
    });

    return NextResponse.json({
      ok: true,
      userCount: result.userCount,
      message: `Conexión activa. Usuarios encontrados: ${result.userCount}.`
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo probar la conexión LDAP";

    return NextResponse.json(
      {
        ok: false,
        message
      },
      { status: 400 }
    );
  }
}
