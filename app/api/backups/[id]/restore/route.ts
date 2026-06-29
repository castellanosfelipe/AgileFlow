import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  isBackupSecurityError,
  requireBackupAdmin,
  restoreBackup
} from "@/lib/backups";

export const runtime = "nodejs";
export const maxDuration = 300;

const restoreSchema = z.object({
  confirmation: z.literal("RESTAURAR")
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireBackupAdmin();
    restoreSchema.parse(await request.json());
    const backup = await restoreBackup(context, id);
    return NextResponse.json(backup);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (error instanceof ZodError) {
      return new NextResponse(
        "Escribe RESTAURAR para confirmar la restauracion",
        { status: 400 }
      );
    }
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo restaurar el backup";
    return new NextResponse(message, { status: 500 });
  }
}
