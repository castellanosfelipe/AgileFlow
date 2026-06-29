import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  forbiddenResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  getBackupForDownload,
  isBackupSecurityError,
  requireBackupAdmin
} from "@/lib/backups";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireBackupAdmin();
    const { backup, filePath } = await getBackupForDownload(context, id);
    const fileInfo = await stat(filePath);
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename="${backup.fileName}"`,
        "Content-Length": String(fileInfo.size),
        "Content-Type": "application/gzip"
      }
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    if (isBackupSecurityError(error)) {
      const message = error instanceof Error ? error.message : "No autorizado";
      return error instanceof Error && error.message.includes("sesion")
        ? unauthorizedResponse()
        : forbiddenResponse(message);
    }
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo descargar el backup";
    return new NextResponse(message, { status: 500 });
  }
}
