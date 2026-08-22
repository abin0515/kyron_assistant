import "server-only";

import { del, head } from "@vercel/blob";

import {
  createSourceFileUploadSession,
  deleteUnusedSourceFile,
  expirePendingSourceFileUploads,
  finalizeSourceFileUploadSession,
  getPendingSourceFileUploadByName,
  getSourceFileById,
  getSourceFileByName,
  getSourceFileUploadSessionById,
  listSourceFilesByUser,
  listSourceFileUsages,
} from "@/server/source-files/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import type {
  CreateSourceFileUploadSessionInput,
  SourceFile,
  SourceFileSummary,
  SourceFileUploadSession,
  SourceFileUsage,
} from "@/server/source-files/types";

export async function prepareCurrentUserSourceFileUpload({
  id,
  originalName,
  ...input
}: CreateSourceFileUploadSessionInput & { id: string }) {
  const user = await getCurrentUser();
  const normalizedName = originalName.trim();

  await expirePendingSourceFileUploads(normalizedName, user.id);

  const existingFile = await getSourceFileByName(normalizedName, user.id);

  if (existingFile) {
    throw new SourceFileNameConflictError(existingFile);
  }

  const pendingUpload = await getPendingSourceFileUploadByName(
    normalizedName,
    user.id,
  );

  if (pendingUpload) {
    throw new SourceFileUploadInProgressError(pendingUpload);
  }

  return createSourceFileUploadSession(id, user.id, {
    ...input,
    originalName: normalizedName,
  });
}

export async function completeCurrentUserSourceFileUpload(
  uploadId: string,
  blobUrl: string,
): Promise<SourceFile> {
  const user = await getCurrentUser();

  return finalizeSourceFileUploadForUser(user.id, uploadId, blobUrl);
}

export async function finalizeSourceFileUploadForUser(
  userId: string,
  uploadId: string,
  blobUrl: string,
): Promise<SourceFile> {
  const upload = await getSourceFileUploadSessionById(uploadId, userId);

  if (!upload || upload.status === "expired") {
    throw new SourceFileUploadSessionNotFoundError();
  }

  const savedUpload = await getSourceFileById(upload.id, userId);

  if (savedUpload) {
    return savedUpload;
  }

  const existingFile = await getSourceFileByName(upload.originalName, userId);

  if (existingFile) {
    throw new SourceFileNameConflictError(existingFile);
  }

  const metadata = await head(blobUrl);

  validateUploadedBlob(upload, metadata);

  const sourceFile = await finalizeSourceFileUploadSession(upload.id, userId, {
    originalName: upload.originalName,
    blobPathname: metadata.pathname,
    blobUrl: metadata.url,
    contentType: upload.contentType,
    byteSize: metadata.size,
    checksumMd5Base64: null,
  });

  if (!sourceFile) {
    throw new SourceFileUploadSessionNotFoundError();
  }

  return sourceFile;
}

export async function getCurrentUserSourceFile(
  id: string,
): Promise<SourceFile | null> {
  const user = await getCurrentUser();

  return getSourceFileById(id, user.id);
}

export async function listCurrentUserSourceFiles(): Promise<
  SourceFileSummary[]
> {
  const user = await getCurrentUser();

  return listSourceFilesByUser(user.id);
}

export async function listCurrentUserSourceFileUsages(
  id: string,
): Promise<SourceFileUsage[] | null> {
  const user = await getCurrentUser();
  const sourceFile = await getSourceFileById(id, user.id);

  if (!sourceFile) {
    return null;
  }

  return listSourceFileUsages(id, user.id);
}

export async function deleteCurrentUserSourceFileRecord(
  id: string,
): Promise<SourceFileDeletionResult> {
  const user = await getCurrentUser();
  const sourceFile = await getSourceFileById(id, user.id);

  if (!sourceFile) {
    return { status: "not_found" };
  }

  const usages = await listSourceFileUsages(id, user.id);

  if (usages.length > 0) {
    return { status: "in_use", usages };
  }

  const deletedFile = await deleteUnusedSourceFile(id, user.id);

  if (deletedFile) {
    await deleteBlobAfterRecord(deletedFile);
  }

  return deletedFile
    ? { status: "deleted", sourceFile: deletedFile }
    : { status: "in_use", usages: await listSourceFileUsages(id, user.id) };
}

export class SourceFileNameConflictError extends Error {
  readonly existingFile: SourceFile;

  constructor(existingFile: SourceFile) {
    super(`A source file named "${existingFile.originalName}" already exists.`);
    this.name = "SourceFileNameConflictError";
    this.existingFile = existingFile;
  }
}

export class SourceFileUploadInProgressError extends Error {
  readonly upload: SourceFileUploadSession;

  constructor(upload: SourceFileUploadSession) {
    super(`A source file named "${upload.originalName}" is already uploading.`);
    this.name = "SourceFileUploadInProgressError";
    this.upload = upload;
  }
}

export class SourceFileUploadSessionNotFoundError extends Error {
  constructor() {
    super("The source file upload session was not found or has expired.");
    this.name = "SourceFileUploadSessionNotFoundError";
  }
}

export class SourceFileUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFileUploadValidationError";
  }
}

export type SourceFileDeletionResult =
  | { status: "deleted"; sourceFile: SourceFile }
  | { status: "not_found" }
  | { status: "in_use"; usages: SourceFileUsage[] };

async function deleteBlobAfterRecord(sourceFile: SourceFile): Promise<void> {
  try {
    await del(sourceFile.blobUrl);
  } catch (error) {
    console.error("Source file Blob cleanup failed", {
      sourceFileId: sourceFile.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function validateUploadedBlob(
  upload: SourceFileUploadSession,
  metadata: {
    pathname: string;
    contentType: string;
    size: number;
  },
) {
  if (metadata.pathname !== upload.blobPathname) {
    throw new SourceFileUploadValidationError(
      "The uploaded file does not match this upload session.",
    );
  }

  if (metadata.contentType !== upload.contentType) {
    throw new SourceFileUploadValidationError(
      "The uploaded file content type does not match its extension.",
    );
  }

  if (metadata.size !== upload.declaredByteSize) {
    throw new SourceFileUploadValidationError(
      "The uploaded file size does not match the selected file.",
    );
  }
}
