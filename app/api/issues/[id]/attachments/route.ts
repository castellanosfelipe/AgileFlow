import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-errors";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditAssignedIssue,
  getCurrentUserAccess
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const maxFileSize = 15 * 1024 * 1024;
const maxFilesPerUpload = 8;
// Allowlist: only known-safe attachment types are accepted. Anything else
// (including executables and inline-renderable .svg/.html/.js) is rejected.
const allowedExtensions = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".heif",
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".txt",
  ".md",
  ".csv",
  ".log",
  // Data
  ".json",
  ".xml",
  // Archives
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz"
]);

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true
};

function sanitizeFileName(fileName: string) {
  const parsed = path.parse(fileName);
  const baseName =
    parsed.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "archivo";
  const extension = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");

  return {
    safeName: `${baseName}${extension}`,
    extension
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const issue = await prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        assigneeId: true
      }
    });

    if (!issue) {
      return new NextResponse("Tarea no encontrada", { status: 404 });
    }

    const access = await getCurrentUserAccess(currentUser.id, issue.projectId);
    if (
      !canEditAssignedIssue({
        currentUserId: currentUser.id,
        isAdmin: access.isAdmin,
        assigneeId: issue.assigneeId
      })
    ) {
      return forbiddenResponse("Solo puedes cargar adjuntos en tareas asignadas a ti");
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!files.length) {
      return new NextResponse("Selecciona al menos un archivo", { status: 400 });
    }

    if (files.length > maxFilesPerUpload) {
      return new NextResponse("Solo puedes cargar hasta 8 archivos a la vez", {
        status: 400
      });
    }

    for (const file of files) {
      const { extension } = sanitizeFileName(file.name);

      if (file.size > maxFileSize) {
        return new NextResponse("Cada archivo debe pesar maximo 15 MB", {
          status: 400
        });
      }

      if (!allowedExtensions.has(extension)) {
        return new NextResponse(
          "Ese tipo de archivo no está permitido. Usa imágenes, documentos, hojas de cálculo, archivos comprimidos o texto.",
          { status: 400 }
        );
      }
    }

    const uploadDirectory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "issues",
      issue.id
    );
    await mkdir(uploadDirectory, { recursive: true });

    const attachments = await prisma.$transaction(async (tx) => {
      const createdAttachments = [];

      for (const file of files) {
        const { safeName } = sanitizeFileName(file.name);
        const storedName = `${randomUUID()}-${safeName}`;
        const storagePath = path.join(
          "public",
          "uploads",
          "issues",
          issue.id,
          storedName
        );
        const absolutePath = path.join(process.cwd(), storagePath);
        const url = `/uploads/issues/${issue.id}/${storedName}`;

        await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

        const attachment = await tx.issueAttachment.create({
          data: {
            issueId: issue.id,
            uploaderId: currentUser.id,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            url,
            storagePath
          },
          include: {
            uploader: {
              select: userSelect
            }
          }
        });

        createdAttachments.push(attachment);
      }

      await tx.auditLog.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          userId: currentUser.id,
          action: "issue.attachment_added",
          entityType: "Issue",
          entityId: issue.id,
          oldValue: auditJson(null),
          newValue: auditJson({
            files: createdAttachments.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType
            }))
          })
        }
      });

      return createdAttachments;
    });

    return NextResponse.json(attachments, { status: 201 });
  } catch (error) {
    return new NextResponse("No se pudieron cargar los archivos", {
      status: 400
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return unauthorizedResponse();

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get("attachmentId");

    if (!attachmentId) {
      return new NextResponse("Selecciona un adjunto para eliminar", {
        status: 400
      });
    }

    const attachment = await prisma.issueAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        issue: {
          select: {
            id: true,
            projectId: true,
            assigneeId: true
          }
        }
      }
    });

    if (!attachment || attachment.issueId !== id) {
      return new NextResponse("Adjunto no encontrado", { status: 404 });
    }

    const access = await getCurrentUserAccess(
      currentUser.id,
      attachment.issue.projectId
    );
    if (
      !canEditAssignedIssue({
        currentUserId: currentUser.id,
        isAdmin: access.isAdmin,
        assigneeId: attachment.issue.assigneeId
      })
    ) {
      return forbiddenResponse("Solo puedes eliminar adjuntos de tareas asignadas a ti");
    }

    await prisma.$transaction(async (tx) => {
      await tx.issueAttachment.delete({
        where: { id: attachment.id }
      });

      await tx.auditLog.create({
        data: {
          projectId: attachment.issue.projectId,
          issueId: attachment.issue.id,
          userId: currentUser.id,
          action: "issue.attachment_deleted",
          entityType: "Issue",
          entityId: attachment.issue.id,
          oldValue: auditJson({
            id: attachment.id,
            name: attachment.name,
            size: attachment.size,
            mimeType: attachment.mimeType
          }),
          newValue: auditJson(null)
        }
      });
    });

    const absolutePath = path.resolve(process.cwd(), attachment.storagePath);
    const projectRoot = path.resolve(process.cwd());
    if (absolutePath.startsWith(projectRoot)) {
      await unlink(absolutePath).catch(() => undefined);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return new NextResponse("No se pudo eliminar el adjunto", {
      status: 400
    });
  }
}
