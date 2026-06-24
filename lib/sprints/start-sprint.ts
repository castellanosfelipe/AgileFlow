export type SprintStatusValue = "PLANNED" | "ACTIVE" | "COMPLETED";

export type SprintRecord = {
  id: string;
  projectId: string;
  status: SprintStatusValue;
  startsAt: Date | null;
};

export type StartSprintRepository<TSprint extends SprintRecord = SprintRecord> = {
  findSprintById(id: string): Promise<TSprint | null>;
  findActiveSprintByProject(projectId: string, excludeSprintId: string): Promise<TSprint | null>;
  updateSprintToActive(id: string, projectId: string, startsAt: Date): Promise<TSprint>;
  createAuditLog(input: {
    projectId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown>;
  }): Promise<unknown>;
};

export class StartSprintError extends Error {
  constructor(
    public readonly code:
      | "SPRINT_NOT_FOUND"
      | "SPRINT_NOT_PLANNED"
      | "ACTIVE_SPRINT_EXISTS",
    message: string
  ) {
    super(message);
    this.name = "StartSprintError";
  }
}

export async function startSprint<TSprint extends SprintRecord>(
  sprintId: string,
  repository: StartSprintRepository<TSprint>,
  now: Date = new Date()
) {
  const sprint = await repository.findSprintById(sprintId);

  if (!sprint) {
    throw new StartSprintError("SPRINT_NOT_FOUND", "Sprint no encontrado");
  }

  if (sprint.status !== "PLANNED") {
    throw new StartSprintError(
      "SPRINT_NOT_PLANNED",
      "Solo se puede iniciar un sprint planificado"
    );
  }

  const activeSprint = await repository.findActiveSprintByProject(
    sprint.projectId,
    sprint.id
  );

  if (activeSprint) {
    throw new StartSprintError(
      "ACTIVE_SPRINT_EXISTS",
      "Ya existe un sprint activo en el proyecto"
    );
  }

  const startsAt = sprint.startsAt ?? now;
  const updatedSprint = await repository.updateSprintToActive(
    sprint.id,
    sprint.projectId,
    startsAt
  );

  await repository.createAuditLog({
    projectId: sprint.projectId,
    action: "sprint.started",
    entityType: "Sprint",
    entityId: sprint.id,
    oldValue: {
      status: "PLANNED"
    },
    newValue: {
      status: "ACTIVE"
    }
  });

  return updatedSprint;
}
