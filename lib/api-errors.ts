import { NextResponse } from "next/server";

export function isDatabaseUnavailable(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P1001"
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    error.message.includes("Can't reach database server")
  );
}

export function databaseUnavailableResponse() {
  return new NextResponse(
    "PostgreSQL no esta disponible en localhost:5433. Ejecuta docker compose up -d, luego npm run db:migrate y npm run db:seed.",
    { status: 503 }
  );
}

export function unauthorizedResponse() {
  return new NextResponse("Debes iniciar sesion", { status: 401 });
}

export function forbiddenResponse(message = "No tienes permisos para esta acción") {
  return new NextResponse(message, { status: 403 });
}
