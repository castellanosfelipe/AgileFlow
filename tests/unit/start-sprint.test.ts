import assert from "node:assert/strict";
import test from "node:test";

import {
  StartSprintError,
  type SprintRecord,
  type StartSprintRepository,
  startSprint
} from "../../lib/sprints/start-sprint";

function createRepository({
  sprint,
  activeSprint
}: {
  sprint: SprintRecord | null;
  activeSprint?: SprintRecord | null;
}) {
  const calls = {
    updateSprintToActive: [] as Array<{
      id: string;
      projectId: string;
      startsAt: Date;
    }>,
    createAuditLog: [] as Array<unknown>
  };

  const repository: StartSprintRepository = {
    async findSprintById() {
      return sprint;
    },
    async findActiveSprintByProject() {
      return activeSprint ?? null;
    },
    async updateSprintToActive(id, projectId, startsAt) {
      calls.updateSprintToActive.push({ id, projectId, startsAt });
      return {
        ...sprint!,
        id,
        projectId,
        startsAt,
        status: "ACTIVE"
      };
    },
    async createAuditLog(input) {
      calls.createAuditLog.push(input);
      return input;
    }
  };

  return { repository, calls };
}

test("inicia un sprint planned y registra auditoria", async () => {
  const now = new Date("2026-06-16T10:00:00.000Z");
  const { repository, calls } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "PLANNED",
      startsAt: null
    }
  });

  const sprint = await startSprint("sprint-1", repository, now);

  assert.equal(sprint.status, "ACTIVE");
  assert.deepEqual(calls.updateSprintToActive, [
    {
      id: "sprint-1",
      projectId: "project-1",
      startsAt: now
    }
  ]);
  assert.deepEqual(calls.createAuditLog, [
    {
      projectId: "project-1",
      action: "sprint.started",
      entityType: "Sprint",
      entityId: "sprint-1",
      oldValue: {
        status: "PLANNED"
      },
      newValue: {
        status: "ACTIVE"
      }
    }
  ]);
});

test("rechaza iniciar un sprint que no esta planned", async () => {
  const { repository, calls } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "ACTIVE",
      startsAt: new Date("2026-06-01T10:00:00.000Z")
    }
  });

  await assert.rejects(
    () => startSprint("sprint-1", repository),
    (error) =>
      error instanceof StartSprintError &&
      error.code === "SPRINT_NOT_PLANNED"
  );

  assert.equal(calls.updateSprintToActive.length, 0);
  assert.equal(calls.createAuditLog.length, 0);
});

test("rechaza iniciar un sprint si ya existe otro active en el proyecto", async () => {
  const { repository, calls } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "PLANNED",
      startsAt: null
    },
    activeSprint: {
      id: "sprint-2",
      projectId: "project-1",
      status: "ACTIVE",
      startsAt: new Date("2026-06-01T10:00:00.000Z")
    }
  });

  await assert.rejects(
    () => startSprint("sprint-1", repository),
    (error) =>
      error instanceof StartSprintError &&
      error.code === "ACTIVE_SPRINT_EXISTS"
  );

  assert.equal(calls.updateSprintToActive.length, 0);
  assert.equal(calls.createAuditLog.length, 0);
});

test("rechaza iniciar un sprint inexistente", async () => {
  const { repository, calls } = createRepository({
    sprint: null
  });

  await assert.rejects(
    () => startSprint("missing-sprint", repository),
    (error) =>
      error instanceof StartSprintError &&
      error.code === "SPRINT_NOT_FOUND"
  );

  assert.equal(calls.updateSprintToActive.length, 0);
  assert.equal(calls.createAuditLog.length, 0);
});
