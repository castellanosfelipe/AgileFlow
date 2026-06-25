import { NextResponse } from "next/server";

import {
  databaseUnavailableResponse,
  isDatabaseUnavailable,
  unauthorizedResponse
} from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export type ActiveSprintHealthDTO = {
  id: string;
  name: string;
  endsAt: string | null;
  total: number;
  done: number;
  inProgress: number;
};

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const sprint = await prisma.sprint.findFirst({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        endsAt: true,
        issues: { select: { status: true } }
      }
    });

    if (!sprint) return NextResponse.json(null);

    const done = sprint.issues.filter((i) => i.status === "DONE").length;
    const inProgress = sprint.issues.filter(
      (i) => i.status === "IN_PROGRESS"
    ).length;

    return NextResponse.json({
      id: sprint.id,
      name: sprint.name,
      endsAt: sprint.endsAt?.toISOString() ?? null,
      total: sprint.issues.length,
      done,
      inProgress
    } satisfies ActiveSprintHealthDTO);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    return new NextResponse("Error al obtener el sprint activo", {
      status: 500
    });
  }
}
