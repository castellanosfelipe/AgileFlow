import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  ensureBackupSchedulerStarted,
  getBackupOverview,
  isBackupSecurityError,
  requireBackupAdmin
} from "@/lib/backups";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireBackupAdmin();
    ensureBackupSchedulerStarted();
    const overview = await getBackupOverview(context);
    return NextResponse.json(overview);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    return new NextResponse("No se pudo cargar la gestion de backups", {
      status: 500
    });
  }
}
