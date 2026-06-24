import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import {
  InsightsUnauthorizedError,
  loadProjectInsightsData
} from "@/lib/insights-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await loadProjectInsightsData("executive"));
  } catch (error) {
    if (error instanceof InsightsUnauthorizedError) {
      return unauthorizedResponse();
    }

    if (isDatabaseUnavailable(error)) {
      return databaseUnavailableResponse();
    }

    return new NextResponse("No se pudo cargar el tablero ejecutivo", {
      status: 500
    });
  }
}
