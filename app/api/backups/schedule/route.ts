import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  disableBackupSchedule,
  isBackupSecurityError,
  requireBackupAdmin,
  updateBackupSchedule
} from "@/lib/backups";

export const runtime = "nodejs";

const scheduleSchema = z.object({
  scheduleEnabled: z.boolean(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  runAt: z.string().regex(/^\d{2}:\d{2}$/),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  retentionMaxCount: z.number().int().min(1),
  retentionMaxDays: z.number().int().min(1).optional().nullable()
});

export async function PATCH(request: Request) {
  try {
    const context = await requireBackupAdmin();
    const payload = scheduleSchema.parse(await request.json());
    const config = await updateBackupSchedule(context, payload);
    return NextResponse.json(config);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (error instanceof ZodError) {
      return new NextResponse(
        error.issues[0]?.message ?? "Datos de programacion no validos",
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
        : "No se pudo guardar la programacion";
    return new NextResponse(message, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const context = await requireBackupAdmin();
    const config = await disableBackupSchedule(context);
    return NextResponse.json(config);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    return new NextResponse("No se pudo pausar la programacion", {
      status: 500
    });
  }
}
