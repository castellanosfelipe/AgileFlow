import bcrypt from "bcryptjs";
import {
  IssuePriority,
  IssueStatus,
  IssueType,
  Prisma,
  PrismaClient,
  ProjectRole,
  SprintStatus
} from "@prisma/client";

const prisma = new PrismaClient();

const { TODO, IN_PROGRESS, DONE } = IssueStatus;
const { LOW, MEDIUM, HIGH, URGENT } = IssuePriority;

const userNames = [
  "Ana Gomez",
  "Bruno Diaz",
  "Carla Ruiz",
  "Diego Mora",
  "Elena Castro",
  "Felipe Rojas",
  "Gabriela Soto",
  "Hector Vargas",
  "Isabel Torres",
  "Julian Medina"
];

const epicNames = [
  ["JIR-EPIC-1", "Backlog y planeacion", "#0f766e"],
  ["JIR-EPIC-2", "Kanban del sprint activo", "#2563eb"],
  ["JIR-EPIC-3", "Autenticacion y seguridad", "#7c3aed"],
  ["JIR-EPIC-4", "Colaboracion del equipo", "#ea580c"],
  ["JIR-EPIC-5", "Observabilidad y auditoria", "#475569"]
];

type SprintKey = "completed" | "active" | "planned" | "backlog";

interface IssueSpec {
  code: string;
  title: string;
  type?: IssueType;
  parent?: string; // codigo de la tarea padre (solo subtareas)
  status: IssueStatus;
  sprint: SprintKey;
  assignee: number; // indice en userNames
  reporter: number;
  epic: number; // indice en epicNames
  priority: IssuePriority;
  estimate: number | null; // minutos (null = pendiente por estimar)
  timeSpent: number; // minutos
  start: string; // YYYY-MM-DD
  due: string; // YYYY-MM-DD
  blockedBy?: string; // codigo de la tarea bloqueante principal
}

// Referencia temporal del seed: hoy = 2026-06-28.
// Los buckets de envejecimiento, vencidos y sobrecarga se calculan respecto
// a esa fecha. Las fechas estan elegidas para poblar todas las vistas.
const baseSpecs: IssueSpec[] = [
  // ── Sprint completado (DONE, mayo) ───────────────────────────────
  { code: "JIR-001", title: "Crear estructura App Router", status: DONE, sprint: "completed", assignee: 0, reporter: 1, epic: 0, priority: MEDIUM, estimate: 240, timeSpent: 240, start: "2026-05-04", due: "2026-05-06" },
  { code: "JIR-002", title: "Configurar Tailwind y tokens base", status: DONE, sprint: "completed", assignee: 1, reporter: 2, epic: 1, priority: LOW, estimate: 180, timeSpent: 210, start: "2026-05-05", due: "2026-05-07" },
  { code: "JIR-003", title: "Agregar componentes base shadcn", status: DONE, sprint: "completed", assignee: 2, reporter: 3, epic: 2, priority: MEDIUM, estimate: 300, timeSpent: 300, start: "2026-05-06", due: "2026-05-08" },
  { code: "JIR-004", title: "Modelar usuarios y miembros", status: DONE, sprint: "completed", assignee: 3, reporter: 4, epic: 3, priority: HIGH, estimate: 240, timeSpent: 270, start: "2026-05-07", due: "2026-05-11" },
  // ── Cadena de dependencias + cuello de botella (carryover vencido) ──
  { code: "JIR-005", title: "Modelar proyectos y sprints", status: IN_PROGRESS, sprint: "active", assignee: 4, reporter: 5, epic: 4, priority: HIGH, estimate: 300, timeSpent: 180, start: "2026-04-22", due: "2026-06-05", blockedBy: "JIR-004" },
  { code: "JIR-006", title: "Modelar issues y epicas", status: IN_PROGRESS, sprint: "active", assignee: 5, reporter: 6, epic: 0, priority: URGENT, estimate: 480, timeSpent: 260, start: "2026-05-01", due: "2026-06-05", blockedBy: "JIR-005" },
  { code: "JIR-007", title: "Preparar seed de datos", status: DONE, sprint: "completed", assignee: 6, reporter: 7, epic: 1, priority: MEDIUM, estimate: 180, timeSpent: 165, start: "2026-05-12", due: "2026-05-14" },
  { code: "JIR-008", title: "Crear navegacion superior minima", status: DONE, sprint: "completed", assignee: 6, reporter: 7, epic: 1, priority: LOW, estimate: 120, timeSpent: 130, start: "2026-05-13", due: "2026-05-15" },
  { code: "JIR-009", title: "Preparar vista backlog", status: TODO, sprint: "active", assignee: 7, reporter: 8, epic: 3, priority: HIGH, estimate: 360, timeSpent: 0, start: "2026-04-15", due: "2026-06-30", blockedBy: "JIR-006" },
  { code: "JIR-010", title: "Preparar vista Kanban", status: TODO, sprint: "active", assignee: 8, reporter: 9, epic: 1, priority: MEDIUM, estimate: 300, timeSpent: 0, start: "2026-06-10", due: "2026-07-01", blockedBy: "JIR-009" },
  { code: "JIR-011", title: "Crear busqueda de issues", status: TODO, sprint: "active", assignee: 9, reporter: 0, epic: 2, priority: MEDIUM, estimate: 240, timeSpent: 0, start: "2026-05-04", due: "2026-06-20", blockedBy: "JIR-006" },
  { code: "JIR-012", title: "Filtrar issues por estado", status: TODO, sprint: "active", assignee: 0, reporter: 1, epic: 3, priority: LOW, estimate: 180, timeSpent: 0, start: "2026-06-12", due: "2026-06-22", blockedBy: "JIR-006" },
  { code: "JIR-013", title: "Mover issue del backlog a sprint", status: TODO, sprint: "active", assignee: 1, reporter: 2, epic: 4, priority: MEDIUM, estimate: 240, timeSpent: 0, start: "2026-06-12", due: "2026-06-24", blockedBy: "JIR-006" },
  { code: "JIR-014", title: "Iniciar sprint planificado", status: DONE, sprint: "active", assignee: 2, reporter: 3, epic: 0, priority: LOW, estimate: 120, timeSpent: 120, start: "2026-06-16", due: "2026-06-18" },
  { code: "JIR-015", title: "Completar sprint activo", status: IN_PROGRESS, sprint: "active", assignee: 4, reporter: 5, epic: 1, priority: MEDIUM, estimate: 300, timeSpent: 150, start: "2026-06-15", due: "2026-06-26" },
  // ── Sobrecarga 1: Diego Mora (3), tareas solapadas 24-26 jun ───────
  { code: "JIR-016", title: "Mover tarjetas entre columnas", status: IN_PROGRESS, sprint: "active", assignee: 3, reporter: 6, epic: 1, priority: HIGH, estimate: 960, timeSpent: 120, start: "2026-06-24", due: "2026-06-26" },
  { code: "JIR-017", title: "Persistir orden manual", status: IN_PROGRESS, sprint: "active", assignee: 3, reporter: 7, epic: 1, priority: HIGH, estimate: 720, timeSpent: 60, start: "2026-06-24", due: "2026-06-25" },
  { code: "JIR-018", title: "Agrupar tarjetas por epica", status: DONE, sprint: "active", assignee: 5, reporter: 8, epic: 1, priority: LOW, estimate: 180, timeSpent: 240, start: "2026-06-16", due: "2026-06-18" },
  { code: "JIR-019", title: "Crear issue rapido", status: TODO, sprint: "active", assignee: 3, reporter: 9, epic: 1, priority: URGENT, estimate: 480, timeSpent: 0, start: "2026-06-24", due: "2026-06-24" },
  // ── Sobrecarga 2: Hector Vargas (7), tareas solapadas 25 jun ───────
  { code: "JIR-020", title: "Mostrar responsable en tarjeta", status: IN_PROGRESS, sprint: "active", assignee: 7, reporter: 0, epic: 1, priority: HIGH, estimate: 600, timeSpent: 200, start: "2026-06-25", due: "2026-06-26" },
  { code: "JIR-021", title: "Registrar comentarios de issue", status: TODO, sprint: "active", assignee: 7, reporter: 1, epic: 3, priority: HIGH, estimate: 480, timeSpent: 0, start: "2026-06-25", due: "2026-06-25" },
  // ── Pendientes por estimar (sin estimate) ─────────────────────────
  { code: "JIR-022", title: "Registrar auditoria de cambios", status: TODO, sprint: "planned", assignee: 8, reporter: 2, epic: 4, priority: MEDIUM, estimate: null, timeSpent: 0, start: "2026-06-16", due: "2026-06-26" },
  { code: "JIR-023", title: "Validar entradas con Zod", status: TODO, sprint: "planned", assignee: 9, reporter: 3, epic: 2, priority: LOW, estimate: null, timeSpent: 0, start: "2026-06-17", due: "2026-06-27" },
  { code: "JIR-024", title: "Proteger rutas con NextAuth", status: TODO, sprint: "backlog", assignee: 0, reporter: 4, epic: 2, priority: MEDIUM, estimate: null, timeSpent: 0, start: "2026-06-15", due: "2026-06-25" },
  { code: "JIR-025", title: "Configurar TanStack Query", status: TODO, sprint: "planned", assignee: 1, reporter: 5, epic: 0, priority: LOW, estimate: null, timeSpent: 0, start: "2026-06-18", due: "2026-06-30" },
  // ── Resto (8-30 dias de envejecimiento) ───────────────────────────
  { code: "JIR-026", title: "Configurar dnd-kit", status: TODO, sprint: "planned", assignee: 2, reporter: 6, epic: 1, priority: MEDIUM, estimate: 240, timeSpent: 0, start: "2026-06-16", due: "2026-06-26" },
  { code: "JIR-027", title: "Crear pruebas Playwright", status: TODO, sprint: "backlog", assignee: 4, reporter: 7, epic: 4, priority: LOW, estimate: 360, timeSpent: 0, start: "2026-06-10", due: "2026-06-22" },
  { code: "JIR-028", title: "Documentar ejecucion local", status: TODO, sprint: "backlog", assignee: 4, reporter: 8, epic: 4, priority: LOW, estimate: 120, timeSpent: 0, start: "2026-06-19", due: "2026-06-26" },
  { code: "JIR-029", title: "Optimizar indices Prisma", status: DONE, sprint: "completed", assignee: 5, reporter: 9, epic: 4, priority: MEDIUM, estimate: 180, timeSpent: 195, start: "2026-05-18", due: "2026-05-20" },
  { code: "JIR-030", title: "Revisar criterios MVP", status: DONE, sprint: "completed", assignee: 6, reporter: 0, epic: 0, priority: HIGH, estimate: 240, timeSpent: 240, start: "2026-05-19", due: "2026-05-22" }
];

// ── Tareas padre con subtareas (rollup de tiempo y progreso) ────────
const subtaskSpecs: IssueSpec[] = [
  // P1 — 1/3 completadas (33%)
  { code: "JIR-031", title: "Sistema de notificaciones in-app", status: IN_PROGRESS, sprint: "active", assignee: 4, reporter: 0, epic: 3, priority: MEDIUM, estimate: null, timeSpent: 0, start: "2026-06-15", due: "2026-06-30" },
  { code: "JIR-032", title: "Definir modelo de notificacion", type: IssueType.SUBTASK, parent: "JIR-031", status: DONE, sprint: "active", assignee: 4, reporter: 0, epic: 3, priority: MEDIUM, estimate: 120, timeSpent: 130, start: "2026-06-15", due: "2026-06-17" },
  { code: "JIR-033", title: "Endpoint de notificaciones", type: IssueType.SUBTASK, parent: "JIR-031", status: IN_PROGRESS, sprint: "active", assignee: 5, reporter: 0, epic: 3, priority: HIGH, estimate: 240, timeSpent: 120, start: "2026-06-17", due: "2026-06-24" },
  { code: "JIR-034", title: "Badge y dropdown en topbar", type: IssueType.SUBTASK, parent: "JIR-031", status: TODO, sprint: "active", assignee: 6, reporter: 0, epic: 3, priority: MEDIUM, estimate: 180, timeSpent: 0, start: "2026-06-22", due: "2026-06-30" },
  // P2 — 2/3 completadas (67%)
  { code: "JIR-035", title: "Exportacion de reportes a CSV/PDF", status: IN_PROGRESS, sprint: "active", assignee: 2, reporter: 1, epic: 4, priority: MEDIUM, estimate: null, timeSpent: 0, start: "2026-06-12", due: "2026-06-27" },
  { code: "JIR-036", title: "Exportar tablero ejecutivo a CSV", type: IssueType.SUBTASK, parent: "JIR-035", status: DONE, sprint: "active", assignee: 2, reporter: 1, epic: 4, priority: LOW, estimate: 90, timeSpent: 95, start: "2026-06-12", due: "2026-06-13" },
  { code: "JIR-037", title: "Exportar Gantt a CSV", type: IssueType.SUBTASK, parent: "JIR-035", status: DONE, sprint: "active", assignee: 8, reporter: 1, epic: 4, priority: LOW, estimate: 120, timeSpent: 110, start: "2026-06-13", due: "2026-06-15" },
  { code: "JIR-038", title: "Generar PDF de sprint", type: IssueType.SUBTASK, parent: "JIR-035", status: IN_PROGRESS, sprint: "active", assignee: 9, reporter: 1, epic: 4, priority: MEDIUM, estimate: 300, timeSpent: 140, start: "2026-06-18", due: "2026-06-27" },
  // P3 — 0/3 completadas (0%)
  { code: "JIR-039", title: "Onboarding guiado de usuarios", status: TODO, sprint: "planned", assignee: 1, reporter: 2, epic: 0, priority: LOW, estimate: null, timeSpent: 0, start: "2026-06-22", due: "2026-07-03" },
  { code: "JIR-040", title: "Tour interactivo inicial", type: IssueType.SUBTASK, parent: "JIR-039", status: TODO, sprint: "planned", assignee: 1, reporter: 2, epic: 0, priority: LOW, estimate: 240, timeSpent: 0, start: "2026-06-22", due: "2026-06-29" },
  { code: "JIR-041", title: "Checklist de primer sprint", type: IssueType.SUBTASK, parent: "JIR-039", status: TODO, sprint: "planned", assignee: 3, reporter: 2, epic: 0, priority: MEDIUM, estimate: 180, timeSpent: 0, start: "2026-06-23", due: "2026-06-30" },
  { code: "JIR-042", title: "Plantillas de tareas sugeridas", type: IssueType.SUBTASK, parent: "JIR-039", status: TODO, sprint: "planned", assignee: 7, reporter: 2, epic: 0, priority: LOW, estimate: 120, timeSpent: 0, start: "2026-06-24", due: "2026-07-01" }
];

const allSpecs = [...baseSpecs, ...subtaskSpecs];

// Bloqueos [bloqueante, bloqueada]: cadena de 5 niveles
// (004→005→006→009→010) + abanico desde el cuello de botella JIR-006.
const blockerEdges: Array<[string, string]> = [
  ["JIR-004", "JIR-005"],
  ["JIR-005", "JIR-006"],
  ["JIR-006", "JIR-009"],
  ["JIR-006", "JIR-011"],
  ["JIR-006", "JIR-012"],
  ["JIR-006", "JIR-013"],
  ["JIR-009", "JIR-010"]
];

const worklogDescriptions = [
  "Avance de implementacion y pruebas locales",
  "Refinamiento con el equipo y ajustes de alcance",
  "Correccion de detalles y revision de PR",
  "Investigacion tecnica y prototipo inicial",
  "Integracion y pruebas manuales del flujo",
  "Documentacion y limpieza de codigo"
];

function dateAt(iso: string, hour = 9) {
  return new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function addDays(iso: string, days: number) {
  const date = dateAt(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// Divide el tiempo total registrado en 1-3 partes para simular varios
// registros de trabajo a lo largo de los dias.
function buildWorklogChunks(timeSpent: number): number[] {
  if (timeSpent <= 0) return [];
  if (timeSpent <= 120) return [timeSpent];
  if (timeSpent <= 360) {
    const first = Math.round(timeSpent * 0.6);
    return [first, timeSpent - first];
  }
  const first = Math.round(timeSpent * 0.4);
  const second = Math.round(timeSpent * 0.35);
  return [first, second, timeSpent - first - second];
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.issueWorklog.deleteMany();
  await prisma.issueBlocker.deleteMany();
  await prisma.issueComment.deleteMany();
  await prisma.issueAttachment.deleteMany();
  await prisma.issueLabel.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.epic.deleteMany();
  await prisma.sprint.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const users = await Promise.all(
    userNames.map((name) =>
      prisma.user.create({
        data: {
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
          passwordHash
        }
      })
    )
  );

  const project = await prisma.project.create({
    data: {
      key: "JIR",
      name: "Jira Lite MVP",
      description: "Proyecto de prueba para backlog y Kanban reducido."
    }
  });

  await prisma.projectMember.createMany({
    data: users.map((user, index) => ({
      projectId: project.id,
      userId: user.id,
      role:
        index === 0
          ? ProjectRole.OWNER
          : index < 3
            ? ProjectRole.ADMIN
            : ProjectRole.MEMBER
    }))
  });

  const [completedSprint, activeSprint, plannedSprint] = await Promise.all([
    prisma.sprint.create({
      data: {
        projectId: project.id,
        name: "Sprint 1 - Fundacion",
        goal: "Definir base tecnica, autenticacion y modelo de datos.",
        status: SprintStatus.COMPLETED,
        startsAt: dateAt("2026-05-04"),
        endsAt: dateAt("2026-05-22", 18),
        position: 10
      }
    }),
    prisma.sprint.create({
      data: {
        projectId: project.id,
        activeProjectId: project.id,
        name: "Sprint 2 - MVP operativo",
        goal: "Conectar backlog y Kanban del sprint activo.",
        status: SprintStatus.ACTIVE,
        startsAt: dateAt("2026-06-15"),
        endsAt: dateAt("2026-07-01", 18),
        position: 20
      }
    }),
    prisma.sprint.create({
      data: {
        projectId: project.id,
        name: "Sprint 3 - Refinamiento",
        goal: "Mejorar experiencia, filtros y pruebas.",
        status: SprintStatus.PLANNED,
        startsAt: dateAt("2026-07-06"),
        endsAt: dateAt("2026-07-17", 18),
        position: 30
      }
    })
  ]);

  const sprintIdByKey: Record<SprintKey, string | null> = {
    completed: completedSprint.id,
    active: activeSprint.id,
    planned: plannedSprint.id,
    backlog: null
  };

  const epics = await Promise.all(
    epicNames.map(([key, name, color]) =>
      prisma.epic.create({
        data: {
          projectId: project.id,
          key,
          name,
          color,
          description: `Epica para ${name.toLowerCase()}.`
        }
      })
    )
  );

  const byCode = new Map<string, { id: string; assigneeId: string }>();
  let position = 0;

  for (const spec of allSpecs) {
    position += 10;
    const type = spec.type ?? IssueType.TASK;
    const isParentTask = type === IssueType.TASK && !spec.parent;
    const timeRemaining =
      spec.status === DONE
        ? 0
        : spec.estimate == null
          ? null
          : Math.max(spec.estimate - spec.timeSpent, 0);
    const parentIssueId = spec.parent ? byCode.get(spec.parent)!.id : null;
    const blockedByIssueId = spec.blockedBy
      ? byCode.get(spec.blockedBy)!.id
      : null;
    const assigneeId = users[spec.assignee].id;

    const issue = await prisma.issue.create({
      data: {
        projectId: project.id,
        sprintId: sprintIdByKey[spec.sprint],
        epicId: epics[spec.epic].id,
        parentIssueId,
        blockedByIssueId,
        isBlockedUntilDone: Boolean(blockedByIssueId),
        assigneeId,
        reporterId: users[spec.reporter].id,
        code: spec.code,
        title: spec.title,
        description: `Trabajo para ${spec.title.toLowerCase()}.`,
        type,
        status: spec.status,
        priority: spec.priority,
        estimate: spec.estimate,
        timeSpent: spec.timeSpent,
        timeRemaining,
        timeSpentDescription:
          spec.timeSpent > 0 ? "Registro acumulado de avances." : null,
        startDate: dateAt(spec.start),
        dueDate: dateAt(spec.due, 18),
        position
      }
    });

    byCode.set(spec.code, { id: issue.id, assigneeId });

    const chunks = buildWorklogChunks(spec.timeSpent);
    if (chunks.length) {
      await prisma.issueWorklog.createMany({
        data: chunks.map((minutes, chunkIndex) => ({
          issueId: issue.id,
          authorId:
            chunkIndex === 1
              ? users[(spec.assignee + 2) % users.length].id
              : assigneeId,
          timeSpent: minutes,
          description:
            worklogDescriptions[
              (spec.code.length + chunkIndex) % worklogDescriptions.length
            ],
          createdAt: addDays(spec.start, chunkIndex + 1)
        }))
      });
    }

    if (isParentTask) {
      await prisma.issueLabel.createMany({
        data: [
          {
            issueId: issue.id,
            name: spec.epic % 2 === 0 ? "frontend" : "backend",
            color: spec.epic % 2 === 0 ? "#2563eb" : "#16a34a"
          },
          {
            issueId: issue.id,
            name: spec.epic % 3 === 0 ? "mvp" : "iteration",
            color: spec.epic % 3 === 0 ? "#f97316" : "#64748b"
          }
        ]
      });
    }

    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        issueId: issue.id,
        userId: assigneeId,
        action: "issue.seeded",
        entityType: "Issue",
        entityId: issue.id,
        oldValue: Prisma.JsonNull,
        newValue: {
          code: spec.code,
          status: spec.status
        }
      }
    });
  }

  for (const [blockerCode, blockedCode] of blockerEdges) {
    await prisma.issueBlocker.create({
      data: {
        blockedIssueId: byCode.get(blockedCode)!.id,
        blockerIssueId: byCode.get(blockerCode)!.id,
        isBlockingUntilDone: true
      }
    });
  }

  const commentCodes = [
    "JIR-001",
    "JIR-005",
    "JIR-006",
    "JIR-016",
    "JIR-020",
    "JIR-031",
    "JIR-035",
    "JIR-009"
  ];
  for (const [commentIndex, code] of commentCodes.entries()) {
    const target = byCode.get(code);
    if (!target) continue;
    await prisma.issueComment.create({
      data: {
        issueId: target.id,
        authorId: users[(commentIndex + 2) % users.length].id,
        body: "Comentario de prueba para validar la colaboracion en la tarea."
      }
    });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { issueCounter: allSpecs.length }
  });

  const subtasks = allSpecs.filter((spec) => spec.type === IssueType.SUBTASK);
  const withoutEstimate = baseSpecs.filter((spec) => spec.estimate == null);

  console.log("Seed listo:");
  console.log("- Proyecto: Jira Lite MVP");
  console.log(`- Usuarios: ${users.length}`);
  console.log("- Sprints: 3, con 1 activo (Sprint 2 - MVP operativo)");
  console.log(`- Epicas: ${epics.length}`);
  console.log(`- Tareas: ${allSpecs.length} (${subtasks.length} subtareas)`);
  console.log(`- Tareas sin estimar: ${withoutEstimate.length}`);
  console.log(`- Bloqueos: ${blockerEdges.length} (cadena de 5 + cuello de botella JIR-006)`);
  console.log("- Sobrecarga: Diego Mora (24-26 jun) y Hector Vargas (25 jun)");
  console.log("- Login de prueba: ana.gomez@example.com / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
