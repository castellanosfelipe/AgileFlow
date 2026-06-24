import bcrypt from "bcryptjs";
import {
  IssuePriority,
  IssueStatus,
  Prisma,
  PrismaClient,
  ProjectRole,
  SprintStatus
} from "@prisma/client";

const prisma = new PrismaClient();

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

async function main() {
  await prisma.auditLog.deleteMany();
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
    userNames.map((name, index) =>
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
        startsAt: new Date("2026-05-18T09:00:00.000Z"),
        endsAt: new Date("2026-05-29T18:00:00.000Z"),
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
        startsAt: new Date("2026-06-01T09:00:00.000Z"),
        endsAt: new Date("2026-06-19T18:00:00.000Z"),
        position: 20
      }
    }),
    prisma.sprint.create({
      data: {
        projectId: project.id,
        name: "Sprint 3 - Refinamiento",
        goal: "Mejorar experiencia, filtros y pruebas.",
        status: SprintStatus.PLANNED,
        startsAt: new Date("2026-06-22T09:00:00.000Z"),
        endsAt: new Date("2026-07-03T18:00:00.000Z"),
        position: 30
      }
    })
  ]);

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

  const issueTitles = [
    "Crear estructura App Router",
    "Configurar Tailwind y tokens base",
    "Agregar componentes base shadcn",
    "Modelar usuarios y miembros",
    "Modelar proyectos y sprints",
    "Modelar issues y epicas",
    "Preparar seed de datos",
    "Crear navegacion superior minima",
    "Preparar vista backlog",
    "Preparar vista Kanban",
    "Crear busqueda de issues",
    "Filtrar issues por estado",
    "Mover issue del backlog a sprint",
    "Iniciar sprint planificado",
    "Completar sprint activo",
    "Mover tarjetas entre columnas",
    "Persistir orden manual",
    "Agrupar tarjetas por epica",
    "Crear issue rapido",
    "Mostrar responsable en tarjeta",
    "Registrar comentarios de issue",
    "Registrar auditoria de cambios",
    "Validar entradas con Zod",
    "Proteger rutas con NextAuth",
    "Configurar TanStack Query",
    "Configurar dnd-kit",
    "Crear pruebas Playwright",
    "Documentar ejecucion local",
    "Optimizar indices Prisma",
    "Revisar criterios MVP"
  ];

  const sprintsByIssueIndex = issueTitles.map((_, index) => {
    if (index < 8) return null;
    if (index < 18) return activeSprint.id;
    if (index < 24) return plannedSprint.id;
    return completedSprint.id;
  });

  const statuses = issueTitles.map((_, index) => {
    if (index < 12) return IssueStatus.TODO;
    if (index < 22) return IssueStatus.IN_PROGRESS;
    return IssueStatus.DONE;
  });

  const priorities = [
    IssuePriority.LOW,
    IssuePriority.MEDIUM,
    IssuePriority.HIGH,
    IssuePriority.URGENT
  ];

  for (const [index, title] of issueTitles.entries()) {
    const issue = await prisma.issue.create({
      data: {
        projectId: project.id,
        sprintId: sprintsByIssueIndex[index],
        epicId: epics[index % epics.length].id,
        assigneeId: users[index % users.length].id,
        reporterId: users[(index + 1) % users.length].id,
        code: `JIR-${String(index + 1).padStart(3, "0")}`,
        title,
        description: `Trabajo inicial para ${title.toLowerCase()}.`,
        type: "TASK",
        status: statuses[index],
        priority: priorities[index % priorities.length],
        estimate: ((index % 8) + 1) * 60,
        timeRemaining: ((index % 8) + 1) * 60,
        startDate: new Date(`2026-06-${String((index % 20) + 1).padStart(2, "0")}T09:00:00.000Z`),
        dueDate: new Date(`2026-06-${String((index % 20) + 5).padStart(2, "0")}T18:00:00.000Z`),
        position: (index + 1) * 10
      }
    });

    await prisma.issueLabel.createMany({
      data: [
        {
          issueId: issue.id,
          name: index % 2 === 0 ? "frontend" : "backend",
          color: index % 2 === 0 ? "#2563eb" : "#16a34a"
        },
        {
          issueId: issue.id,
          name: index % 3 === 0 ? "mvp" : "iteration",
          color: index % 3 === 0 ? "#f97316" : "#64748b"
        }
      ]
    });

    if (index < 10) {
      await prisma.issueComment.create({
        data: {
          issueId: issue.id,
          authorId: users[(index + 2) % users.length].id,
          body: "Comentario de prueba para validar colaboracion en issues."
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        issueId: issue.id,
        userId: users[index % users.length].id,
        action: "issue.seeded",
        entityType: "Issue",
        entityId: issue.id,
        oldValue: Prisma.JsonNull,
        newValue: {
          code: issue.code,
          status: issue.status
        }
      }
    });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { issueCounter: issueTitles.length }
  });

  console.log("Seed listo:");
  console.log("- Proyecto: Jira Lite MVP");
  console.log("- Usuarios: 10");
  console.log("- Sprints: 3, con 1 activo");
  console.log("- Epicas: 5");
  console.log("- Issues: 30");
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
