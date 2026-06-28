import { z } from "zod";

export const issueStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
export const issuePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const issueTypeSchema = z.enum(["TASK", "SUBTASK"]);
export const sprintStatusSchema = z.enum(["PLANNED", "ACTIVE", "COMPLETED"]);

const nullableDateString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: "La fecha no es válida"
  });

const requiredDateString = z
  .string()
  .trim()
  .min(1, "La fecha es obligatoria")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "La fecha no es válida"
  });

const estimateMinutesSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(525600)
  .optional()
  .nullable();

export const sprintCreateSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
    goal: z.string().trim().max(240).optional().nullable(),
    startsAt: requiredDateString,
    endsAt: requiredDateString
  })
  .refine((data) => new Date(data.endsAt) >= new Date(data.startsAt), {
    message: "La fecha de fin no puede ser menor que la fecha de inicio",
    path: ["endsAt"]
  });

export const sprintActionSchema = z
  .union([
    z.object({
      action: z.literal("start")
    }),
    z.object({
      action: z.literal("complete"),
      movePendingTo: z.enum(["backlog", "sprint"]),
      targetSprintId: z.string().cuid().optional().nullable()
    })
  ])
  .superRefine((data, context) => {
    if (
      data.action === "complete" &&
      data.movePendingTo === "sprint" &&
      !data.targetSprintId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona un sprint destino",
        path: ["targetSprintId"]
      });
    }
  });

export const issueCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(1000).optional().nullable(),
    type: issueTypeSchema.default("TASK"),
    status: issueStatusSchema.default("TODO"),
    priority: issuePrioritySchema.default("MEDIUM"),
    estimate: estimateMinutesSchema,
    timeSpent: estimateMinutesSchema,
    timeRemaining: estimateMinutesSchema,
    timeSpentDescription: z.string().trim().max(1000).optional().nullable(),
    startDate: nullableDateString,
    dueDate: nullableDateString,
    sprintId: z.string().cuid().optional().nullable(),
    parentIssueId: z.string().cuid().optional().nullable(),
    assigneeId: z.string().cuid().optional().nullable(),
    epicId: z.string().cuid().optional().nullable()
  })
  .superRefine((data, context) => {
    if (data.timeSpent && data.timeSpent > 0 && !data.timeSpentDescription?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La descripción del tiempo empleado es obligatoria",
        path: ["timeSpentDescription"]
      });
    }

    if (
      data.startDate &&
      data.dueDate &&
      new Date(data.dueDate) < new Date(data.startDate)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de vencimiento no puede ser menor que la fecha de inicio",
        path: ["dueDate"]
      });
    }
  });

export const issueUpdateSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  type: issueTypeSchema.optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  estimate: estimateMinutesSchema,
  timeSpent: estimateMinutesSchema,
  timeRemaining: estimateMinutesSchema,
  timeSpentDescription: z.string().trim().max(1000).optional().nullable(),
  startDate: nullableDateString,
  dueDate: nullableDateString,
  sprintId: z.string().cuid().optional().nullable(),
  assigneeId: z.string().cuid().optional().nullable(),
  epicId: z.string().cuid().optional().nullable(),
  blockedByIssueId: z.string().cuid().optional().nullable(),
  isBlockedUntilDone: z.boolean().optional(),
  position: z.coerce.number().int().min(0).optional()
}).superRefine((data, context) => {
  if (
    data.startDate &&
    data.dueDate &&
    new Date(data.dueDate) < new Date(data.startDate)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La fecha de vencimiento no puede ser menor que la fecha de inicio",
      path: ["dueDate"]
    });
  }
});

export const issueCommentCreateSchema = z.object({
  body: z.string().trim().min(1, "El comentario es obligatorio").max(2000)
});

export const issueWorklogCreateSchema = z.object({
  timeSpent: z.coerce
    .number()
    .int()
    .min(1, "Registra un tiempo mayor a 0")
    .max(525600),
  description: z
    .string()
    .trim()
    .min(1, "La descripción es obligatoria")
    .max(1000, "La descripción no puede superar 1000 caracteres")
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  email: z.string().trim().email("Ingresa un correo válido").max(180),
  password: z.string().min(8, "La contraseña debe tener mínimo 8 caracteres"),
  role: z.enum(["admin", "user"]).default("user")
});

export const userRoleUpdateSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.boolean().optional()
}).refine((data) => data.role !== undefined || data.isActive !== undefined, {
  message: "Selecciona el cambio que quieres aplicar"
});

export const userDeleteSchema = z.object({
  userId: z.string().cuid()
});

export const backlogQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: issueStatusSchema.or(z.literal("ALL")).optional(),
  assigneeId: z.string().cuid().or(z.literal("ALL")).optional()
});

export const boardQuerySchema = z.object({
  q: z.string().trim().optional(),
  epicId: z.string().cuid().or(z.literal("ALL")).optional(),
  label: z.string().trim().or(z.literal("ALL")).optional(),
  assigneeId: z.string().cuid().or(z.literal("ALL")).optional()
});

export const backupFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);

const backupRunAtSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:mm");

export const backupStoragePathSchema = z.object({
  storagePath: z
    .string()
    .trim()
    .min(3, "Ingresa una ruta valida")
    .max(500, "La ruta es demasiado larga"),
  createIfMissing: z.boolean().default(false)
});

export const backupScheduleSchema = z
  .object({
    scheduleEnabled: z.boolean().default(false),
    frequency: backupFrequencySchema.default("DAILY"),
    runAt: backupRunAtSchema.default("02:00"),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
    dayOfMonth: z.coerce.number().int().min(1).max(28).optional().nullable(),
    retentionMaxCount: z.coerce.number().int().min(1).max(100).default(10),
    retentionMaxDays: z.coerce.number().int().min(1).max(3650).optional().nullable()
  })
  .superRefine((data, context) => {
    if (data.frequency === "WEEKLY" && data.dayOfWeek === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona el dia de la semana",
        path: ["dayOfWeek"]
      });
    }

    if (data.frequency === "MONTHLY" && data.dayOfMonth === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona el dia del mes",
        path: ["dayOfMonth"]
      });
    }
  });

export const backupRestoreSchema = z.object({
  confirmation: z
    .string()
    .trim()
    .refine((value) => value === "RESTAURAR", {
      message: "Escribe RESTAURAR para confirmar"
    })
});
