import assert from "node:assert/strict";
import test from "node:test";

import {
  CompleteSprintError,
  type CompleteSprintRecord,
  type CompleteSprintRepository,
  completeSprint
} from "../../lib/sprints/complete-sprint";

type TestIssue = {
  id: string;
  sprintId: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
};

function createRepository({
  sprint,
  plannedSprint = null,
  issues = []
}: {
  sprint: CompleteSprintRecord | null;
  plannedSprint?: CompleteSprintRecord | null;
  issues?: TestIssue[];
}) {
  const calls = {
    updateSprintToCompleted: [] as Array<{ id: string; completedAt: Date }>,
    createAuditLog: [] as Array<unknown>
  };

  const repository: CompleteSprintRepository = {
    async findSprintById() {
      return sprint;
    },
    async findPlannedSprintById(id, projectId) {
      if (
        plannedSprint?.id === id &&
        plannedSprint.projectId === projectId &&
        plannedSprint.status === "PLANNED"
      ) {
        return plannedSprint;
      }
      return null;
    },
    async movePendingIssues({ fromSprintId, toSprintId }) {
      let moved = 0;
      for (const issue of issues) {
        if (issue.sprintId === fromSprintId && issue.status !== "DONE") {
          issue.sprintId = toSprintId;
          moved += 1;
        }
      }
      return moved;
    },
    async updateSprintToCompleted(id, completedAt) {
      calls.updateSprintToCompleted.push({ id, completedAt });
      return {
        ...sprint!,
        id,
        status: "COMPLETED"
      };
    },
    async createAuditLog(input) {
      calls.createAuditLog.push(input);
      return input;
    }
  };

  return { repository, calls, issues };
}

test("completa un sprint active, mueve pendientes al backlog y deja done en el sprint", async () => {
  const now = new Date("2026-06-16T12:00:00.000Z");
  const { repository, calls, issues } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "ACTIVE"
    },
    issues: [
      { id: "issue-1", sprintId: "sprint-1", status: "TODO" },
      { id: "issue-2", sprintId: "sprint-1", status: "IN_PROGRESS" },
      { id: "issue-3", sprintId: "sprint-1", status: "DONE" }
    ]
  });

  const sprint = await completeSprint(
    "sprint-1",
    { type: "backlog" },
    repository,
    now
  );

  assert.equal(sprint.status, "COMPLETED");
  assert.deepEqual(
    issues.map((issue) => [issue.id, issue.sprintId]),
    [
      ["issue-1", null],
      ["issue-2", null],
      ["issue-3", "sprint-1"]
    ]
  );
  assert.deepEqual(calls.updateSprintToCompleted, [
    { id: "sprint-1", completedAt: now }
  ]);
  assert.deepEqual(calls.createAuditLog, [
    {
      projectId: "project-1",
      action: "sprint.completed",
      entityType: "Sprint",
      entityId: "sprint-1",
      oldValue: {
        status: "ACTIVE"
      },
      newValue: {
        status: "COMPLETED",
        movedPendingIssues: 2,
        pendingIssueTarget: { type: "backlog" }
      }
    }
  ]);
});

test("mueve pendientes a otro sprint planned", async () => {
  const { repository, issues } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "ACTIVE"
    },
    plannedSprint: {
      id: "sprint-2",
      projectId: "project-1",
      status: "PLANNED"
    },
    issues: [
      { id: "issue-1", sprintId: "sprint-1", status: "TODO" },
      { id: "issue-2", sprintId: "sprint-1", status: "DONE" }
    ]
  });

  await completeSprint(
    "sprint-1",
    { type: "sprint", sprintId: "sprint-2" },
    repository
  );

  assert.deepEqual(
    issues.map((issue) => [issue.id, issue.sprintId]),
    [
      ["issue-1", "sprint-2"],
      ["issue-2", "sprint-1"]
    ]
  );
});

test("rechaza completar un sprint que no esta active", async () => {
  const { repository, calls } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "PLANNED"
    }
  });

  await assert.rejects(
    () => completeSprint("sprint-1", { type: "backlog" }, repository),
    (error) =>
      error instanceof CompleteSprintError &&
      error.code === "SPRINT_NOT_ACTIVE"
  );

  assert.equal(calls.updateSprintToCompleted.length, 0);
  assert.equal(calls.createAuditLog.length, 0);
});

test("rechaza mover pendientes a un sprint destino no planned", async () => {
  const { repository, calls } = createRepository({
    sprint: {
      id: "sprint-1",
      projectId: "project-1",
      status: "ACTIVE"
    },
    plannedSprint: {
      id: "sprint-2",
      projectId: "project-1",
      status: "ACTIVE"
    }
  });

  await assert.rejects(
    () =>
      completeSprint(
        "sprint-1",
        { type: "sprint", sprintId: "sprint-2" },
        repository
      ),
    (error) =>
      error instanceof CompleteSprintError &&
      error.code === "TARGET_SPRINT_NOT_PLANNED"
  );

  assert.equal(calls.updateSprintToCompleted.length, 0);
  assert.equal(calls.createAuditLog.length, 0);
});
