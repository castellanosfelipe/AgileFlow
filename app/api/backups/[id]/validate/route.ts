import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  isBackupSecurityError,
  requireBackupAdmin,
  validateBackupIntegrity
} from "@/lib/backups";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireBackupAdmin();
    const result = await validateBackupIntegrity(context, id);
    return NextResponse.json(result);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    const message =
      error instanceof Error ? error.message : "No se pudo validar el backup";
    return new NextResponse(message, { status: 500 });
  }
}
