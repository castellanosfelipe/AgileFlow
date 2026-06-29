import { BackupType } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  createBackup,
  isBackupSecurityError,
  requireBackupAdmin
} from "@/lib/backups";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const context = await requireBackupAdmin();
    const backup = await createBackup({
      project: context.project,
      type: BackupType.MANUAL,
      userId: context.user.id
    });
    return NextResponse.json(backup, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    const message =
      error instanceof Error ? error.message : "No se pudo generar el backup";
    return new NextResponse(message, { status: 500 });
  }
}
