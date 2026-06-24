export type CompleteSprintStatusValue = "PLANNED" | "ACTIVE" | "COMPLETED";

export type CompleteSprintRecord = {
  id: string;
  projectId: string;
  status: CompleteSprintStatusValue;
};

export type CompleteSprintTarget =
  | { type: "backlog" }
  | { type: "sprint"; sprintId: string };

export type CompleteSprintRepository<
  TSprint extends CompleteSprintRecord = CompleteSprintRecord
> = {
  findSprintById(id: string): Promise<TSprint | null>;
  findPlannedSprintById(id: string, projectId: string): Promise<TSprint | null>;
  movePendingIssues(input: {
    fromSprintId: string;
    toSprintId: string | null;
  }): Promise<number>;
  updateSprintToCompleted(id: string, completedAt: Date): Promise<TSprint>;
  createAuditLog(input: {
    projectId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown>;
  }): Promise<unknown>;
};

export class CompleteSprintError extends Error {
  constructor(
    public readonly code:
      | "SPRINT_NOT_FOUND"
      | "SPRINT_NOT_ACTIVE"
      | "TARGET_SPRINT_REQUIRED"
      | "TARGET_SPRINT_NOT_PLANNED",
    message: string
  ) {
    super(message);
    this.name = "CompleteSprintError";
  }
}

export async function completeSprint<TSprint extends CompleteSprintRecord>(
  sprintId: string,
  target: CompleteSprintTarget,
  repository: CompleteSprintRepository<TSprint>,
  now: Date = new Date()
) {
  const sprint = await repository.findSprintById(sprintId);

  if (!sprint) {
    throw new CompleteSprintError("SPRINT_NOT_FOUND", "Sprint no encontrado");
  }

  if (sprint.status !== "ACTIVE") {
    throw new CompleteSprintError(
      "SPRINT_NOT_ACTIVE",
      "Solo se puede completar un sprint activo"
    );
  }

  let targetSprintId: string | null = null;

  if (target.type === "sprint") {
    if (!target.sprintId) {
      throw new CompleteSprintError(
        "TARGET_SPRINT_REQUIRED",
        "Selecciona un sprint planificado para mover pendientes"
      );
    }

    const plannedSprint = await repository.findPlannedSprintById(
      target.sprintId,
      sprint.projectId
    );

    if (!plannedSprint) {
      throw new CompleteSprintError(
        "TARGET_SPRINT_NOT_PLANNED",
        "El sprint destino debe estar planificado"
      );
    }

    targetSprintId = plannedSprint.id;
  }

  const movedPendingIssues = await repository.movePendingIssues({
    fromSprintId: sprint.id,
    toSprintId: targetSprintId
  });

  const updatedSprint = await repository.updateSprintToCompleted(sprint.id, now);

  await repository.createAuditLog({
    projectId: sprint.projectId,
    action: "sprint.completed",
    entityType: "Sprint",
    entityId: sprint.id,
    oldValue: {
      status: "ACTIVE"
    },
    newValue: {
      status: "COMPLETED",
      movedPendingIssues,
      pendingIssueTarget:
        target.type === "backlog"
          ? { type: "backlog" }
          : { type: "sprint", sprintId: targetSprintId }
    }
  });

  return updatedSprint;
}
