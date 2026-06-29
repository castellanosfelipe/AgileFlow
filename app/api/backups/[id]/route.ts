import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  deleteBackup,
  isBackupSecurityError,
  requireBackupAdmin
} from "@/lib/backups";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireBackupAdmin();
    const backup = await deleteBackup(context, id);
    return NextResponse.json(backup);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    const message =
      error instanceof Error ? error.message : "No se pudo eliminar el backup";
    return new NextResponse(message, { status: 500 });
  }
}
