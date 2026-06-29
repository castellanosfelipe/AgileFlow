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
  updateBackupStoragePath
} from "@/lib/backups";

export const runtime = "nodejs";

const configSchema = z.object({
  storagePath: z.string().min(1),
  createIfMissing: z.boolean().default(true)
});

export async function PATCH(request: Request) {
  try {
    const context = await requireBackupAdmin();
    const payload = configSchema.parse(await request.json());
    const config = await updateBackupStoragePath(
      context,
      payload.storagePath,
      payload.createIfMissing
    );
    return NextResponse.json(config);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message ?? "Datos no validos",
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
      error instanceof Error ? error.message : "No se pudo guardar la ruta";
    return new NextResponse(message, { status: 500 });
  }
}
