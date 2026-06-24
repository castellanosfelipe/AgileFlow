import { NextResponse } from "next/server";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { syncDirectoryUsers } from "@/lib/directory-sync";
import { getCurrentUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();
    if (!(await getCurrentUserAccess(currentUser.id)).isAdmin) {
      return forbiddenResponse();
    }

    const project = await prisma.project.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });

    if (!project) {
      return new NextResponse("No hay proyecto activo para sincronizar", {
        status: 400
      });
    }

    const syncedCount = await syncDirectoryUsers(project.id, true);

    return NextResponse.json({
      ok: true,
      syncedCount,
      message: `Sincronización completada. Usuarios actualizados: ${syncedCount}.`
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo sincronizar el Directorio Activo";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
