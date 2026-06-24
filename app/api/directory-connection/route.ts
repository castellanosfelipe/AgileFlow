import { NextResponse } from "next/server";
import { z } from "zod";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLdapConfig } from "@/lib/ldap";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const directoryConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(120),
  port: z.coerce.number().int().min(1).max(65535),
  bindDn: z.string().trim().min(1).max(500),
  bindPassword: z.string().optional(),
  baseDn: z.string().trim().min(1).max(500),
  userFilter: z.string().trim().min(1).max(1200),
  loginAttribute: z.string().trim().min(1).max(80)
});

function toResponse(config: {
  id?: string | null;
  name: string;
  host: string;
  port: number;
  bindDn: string;
  baseDn: string;
  userFilter: string;
  loginAttribute: string;
  createdAt?: Date | null;
}) {
  return {
    id: config.id ?? null,
    name: config.name,
    host: config.host,
    port: config.port,
    bindDn: config.bindDn,
    bindPassword: "",
    hasPassword: true,
    baseDn: config.baseDn,
    userFilter: config.userFilter,
    loginAttribute: config.loginAttribute,
    createdAt: config.createdAt?.toISOString() ?? null
  };
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();
    if (!(await getCurrentUserAccess(currentUser.id)).isAdmin) {
      return forbiddenResponse();
    }

    const savedConfig = await prisma.directoryConnection.findFirst({
      orderBy: { createdAt: "asc" }
    });

    if (savedConfig) {
      return NextResponse.json(toResponse(savedConfig));
    }

    const envConfig = await getActiveLdapConfig();

    if (!envConfig) {
      return NextResponse.json({
        id: null,
        name: "",
        host: "",
        port: 389,
        bindDn: "",
        bindPassword: "",
        hasPassword: false,
        baseDn: "",
        userFilter: "(objectClass=user)",
        loginAttribute: "sAMAccountName",
        createdAt: null
      });
    }

    return NextResponse.json(toResponse(envConfig));
  } catch (error) {
    return new NextResponse("No se pudo cargar la conexión LDAP", {
      status: 500
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();
    if (!(await getCurrentUserAccess(currentUser.id)).isAdmin) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const payload = directoryConnectionSchema.parse(body);
    const savedConfig = await prisma.directoryConnection.findFirst({
      orderBy: { createdAt: "asc" }
    });
    const activeConfig = savedConfig ? null : await getActiveLdapConfig();
    const bindPassword =
      payload.bindPassword?.trim() ||
      savedConfig?.bindPassword ||
      activeConfig?.bindPassword;

    if (!bindPassword) {
      return new NextResponse("La contraseña es obligatoria", { status: 400 });
    }

    const data = {
      name: payload.name,
      host: payload.host,
      port: payload.port,
      bindDn: payload.bindDn,
      bindPassword,
      baseDn: payload.baseDn,
      userFilter: payload.userFilter,
      loginAttribute: payload.loginAttribute
    };

    const config = savedConfig
      ? await prisma.directoryConnection.update({
          where: { id: savedConfig.id },
          data
        })
      : await prisma.directoryConnection.create({ data });

    return NextResponse.json(toResponse(config));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Revisa los campos de la conexión", issues: error.flatten() },
        { status: 400 }
      );
    }

    return new NextResponse("No se pudo guardar la conexión LDAP", {
      status: 500
    });
  }
}

export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();
    if (!(await getCurrentUserAccess(currentUser.id)).isAdmin) {
      return forbiddenResponse();
    }

    const savedConfig = await prisma.directoryConnection.findFirst({
      orderBy: { createdAt: "asc" }
    });

    if (savedConfig) {
      await prisma.directoryConnection.delete({
        where: { id: savedConfig.id }
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return new NextResponse("No se pudo eliminar la conexión LDAP", {
      status: 500
    });
  }
}
