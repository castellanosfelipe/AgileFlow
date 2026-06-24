import { Prisma } from "@prisma/client";

export function auditJson(value: unknown) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export function serializeAuditValue(
  value: Date | string | number | boolean | null | undefined
) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}
