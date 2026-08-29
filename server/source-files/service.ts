import "server-only";

import { del, get, head } from "@vercel/blob";

import type {
  PageRequest,
  PageResult,
} from "@/server/http/pagination";
import { calculateStoredBlobMd5 } from "@/server/source-files/checksum";
import {
  claimSourceFileForExtraction,
  createSourceFileUploadSession,
  deleteDeletableSourceFile,
  expirePendingSourceFileUploads,
  finalizeSourceFileUploadSession,
  getPendingSourceFileUploadByName,
  getSourceFileById,
  getSourceFileByName,
  getSourceFileUploadSessionById,
  listSourceFilesByUser,
  listSourceFileUsages,
  markSourceFileExtractionFailed,
  saveSourceFileExtractedText,
  summarizeSourceFilesByUser,
} from "@/server/source-files/repository";
import {
  extractTextFromSourceFile,
  SourceTextValidationError,
} from "@/server/source-files/source-text";
import { getCurrentUser } from "@/server/identity/current-user";
import type {
  CreateSourceFileUploadSessionInput,
  SourceFile,
  SourceFileLibrarySummary,
  SourceFileListFilter,
  SourceFileSummary,
  SourceFileUploadSession,
  SourceFileUsage,
} from "@/server/source-files/types";

const MAX_SOURCE_EXTRACTION_SIZE_BYTES = 50 * 1024 * 1024;

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

  const checksumMd5Base64 = await calculateStoredBlobMd5({
    blobUrl: metadata.url,
    byteSize: metadata.size,
    contentType: upload.contentType,
  });

  const sourceFile = await finalizeSourceFileUploadSession(upload.id, userId, {
    originalName: upload.originalName,
    blobPathname: metadata.pathname,
    blobUrl: metadata.url,
    contentType: upload.contentType,
    byteSize: metadata.size,
    checksumMd5Base64,
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

export async function extractCurrentUserSourceFileText(
  id: string,
): Promise<SourceFile | null> {
  const user = await getCurrentUser();
  const sourceFile = await getSourceFileById(id, user.id);

  if (!sourceFile) {
    return null;
  }

  if (sourceFile.processingStatus === "ready" && sourceFile.extractedText) {
    return sourceFile;
  }

  validateSourceFileForExtraction(sourceFile);

  const claimedFile = await claimSourceFileForExtraction(id, user.id);

  if (!claimedFile) {
    const latestFile = await getSourceFileById(id, user.id);

    if (latestFile?.processingStatus === "ready" && latestFile.extractedText) {
      return latestFile;
    }

    throw new SourceFileExtractionInProgressError();
  }

  try {
    const buffer = await downloadSourceFile(claimedFile);
    const extractedText = await extractTextFromSourceFile(
      claimedFile.contentType,
      buffer,
    );
    const savedFile = await saveSourceFileExtractedText(
      id,
      user.id,
      extractedText,
    );

    if (!savedFile) {
      throw new Error("The extracted source file text could not be saved.");
    }

    return savedFile;
  } catch (error) {
    const message = extractionFailureMessage(error);

    console.error("Source file text extraction failed", {
      sourceFileId: id,
      contentType: sourceFile.contentType,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    await markSourceFileExtractionFailed(id, user.id, message);

    if (error instanceof SourceTextValidationError) {
      throw new SourceFileExtractionValidationError(error.message);
    }

    throw error;
  }
}

export async function listCurrentUserSourceFiles(
  page: PageRequest,
  filter: SourceFileListFilter,
): Promise<
  PageResult<SourceFileSummary> & { summary: SourceFileLibrarySummary }
> {
  const user = await getCurrentUser();

  const [files, summary] = await Promise.all([
    listSourceFilesByUser(user.id, page, filter),
    summarizeSourceFilesByUser(user.id),
  ]);

  return { ...files, summary };
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

  const activeUsages = usages.filter((usage) => usage.state === "active");

  if (activeUsages.length > 0) {
    return { status: "in_use", usages: activeUsages };
  }

  const deletedFile = await deleteDeletableSourceFile(id, user.id);

  if (deletedFile) {
    await deleteBlobAfterRecord(deletedFile);
  }

  return deletedFile
    ? { status: "deleted", sourceFile: deletedFile }
    : {
        status: "in_use",
        usages: (await listSourceFileUsages(id, user.id)).filter(
          (usage) => usage.state === "active",
        ),
      };
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

export class SourceFileExtractionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFileExtractionValidationError";
  }
}

export class SourceFileExtractionInProgressError extends Error {
  constructor() {
    super("This source file is already being processed.");
    this.name = "SourceFileExtractionInProgressError";
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

function validateSourceFileForExtraction(sourceFile: SourceFile): void {
  if (sourceFile.processingStatus === "ready") {
    throw new Error("The source file is ready but has no extracted text.");
  }

  if (sourceFile.byteSize > MAX_SOURCE_EXTRACTION_SIZE_BYTES) {
    throw new SourceFileExtractionValidationError(
      "Source files must be 50 MB or smaller for text extraction.",
    );
  }
}

async function downloadSourceFile(sourceFile: SourceFile): Promise<Buffer> {
  const result = await get(sourceFile.blobUrl, {
    access: "private",
    useCache: false,
  });

  if (!result || !result.stream || result.statusCode !== 200) {
    throw new Error("The source file Blob could not be downloaded.");
  }

  if (
    result.blob.size !== sourceFile.byteSize ||
    result.blob.size > MAX_SOURCE_EXTRACTION_SIZE_BYTES
  ) {
    throw new Error("The source file Blob size does not match its record.");
  }

  if (result.blob.contentType !== sourceFile.contentType) {
    throw new Error("The source file Blob type does not match its record.");
  }

  const arrayBuffer = await new Response(result.stream).arrayBuffer();

  if (arrayBuffer.byteLength !== result.blob.size) {
    throw new Error("The source file Blob download is incomplete.");
  }

  return Buffer.from(arrayBuffer);
}

function extractionFailureMessage(error: unknown): string {
  if (error instanceof SourceTextValidationError) {
    return error.message;
  }

  return "Text extraction failed. Try again.";
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
