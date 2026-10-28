import {
  del,
  issueSignedToken,
} from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import {
  finalizeSourceFileUploadForUser,
  prepareCurrentUserSourceFileUpload,
  SourceFileNameConflictError,
  SourceFileUploadInProgressError,
  SourceFileUploadValidationError,
} from "@/server/source-files/service";
import type { SourceFileContentType } from "@/server/source-files/types";
import type { SourceFileUploadClientPayload } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SOURCE_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const UPLOAD_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return requestErrorResponse("The upload request must contain JSON.");
  }

  if (!isUploadRequestBody(requestBody)) {
    return requestErrorResponse("The upload request is invalid.");
  }

  if (isTokenRequest(requestBody) && !hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    const response = await handleUploadPresigned({
      body: requestBody,
      request,
      getSignedToken: createUploadToken,
      onUploadCompleted: saveCompletedUpload,
    });

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof SourceFileNameConflictError) {
      return conflictErrorResponse(error.message, false);
    }

    if (error instanceof SourceFileUploadInProgressError) {
      return conflictErrorResponse(error.message, true);
    }

    if (error instanceof SourceFileUploadValidationError) {
      return requestErrorResponse(error.message);
    }

    return internalErrorResponse(error, {
      context: "Source file upload request failed",
      fallbackMessage: "The source file could not be uploaded.",
      retryable: true,
    });
  }
}

async function createUploadToken(
  pathname: string,
  clientPayload: string | null,
) {
  const upload = parseClientPayload(clientPayload, pathname);
  const validUntil = Date.now() + UPLOAD_TOKEN_LIFETIME_MS;
  const contentType = contentTypeForFileName(upload.name);
  const session = await prepareCurrentUserSourceFileUpload({
    id: upload.uploadId,
    originalName: upload.name,
    blobPathname: pathname,
    contentType,
    declaredByteSize: upload.size,
    expiresAt: new Date(validUntil).toISOString(),
  });
  const tokenPayload = JSON.stringify({
    userId: session.createdById,
    uploadId: session.id,
  } satisfies SourceFileUploadTokenPayload);
  const token = await issueSignedToken({
    pathname,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_SOURCE_FILE_SIZE_BYTES,
    validUntil,
  });

  return {
    token,
    urlOptions: {
      allowedContentTypes: [contentType],
      maximumSizeInBytes: MAX_SOURCE_FILE_SIZE_BYTES,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
      tokenPayload,
    },
  };
}

async function saveCompletedUpload({
  blob,
  tokenPayload,
}: {
  blob: {
    pathname: string;
    url: string;
  };
  tokenPayload?: string | null;
}): Promise<void> {
  try {
    const upload = parseTokenPayload(tokenPayload);
    await finalizeSourceFileUploadForUser(
      upload.userId,
      upload.uploadId,
      blob.url,
    );
  } catch (error) {
    await deleteRejectedUpload(blob.url);
    throw error;
  }
}

async function deleteRejectedUpload(blobUrl: string): Promise<void> {
  try {
    await del(blobUrl);
  } catch (error) {
    console.error("Rejected source file Blob cleanup failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

type SourceFileUploadTokenPayload = {
  userId: string;
  uploadId: string;
};

const CONTENT_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const satisfies Record<string, SourceFileContentType>;

function parseClientPayload(
  clientPayload: string | null,
  pathname: string,
): SourceFileUploadClientPayload {
  const payload = parseJsonObject(clientPayload, "Upload metadata is missing.");
  const uploadId = typeof payload.uploadId === "string" ? payload.uploadId : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const size = payload.size;

  if (!isUuid(uploadId)) {
    throw new SourceFileUploadValidationError("The upload ID is invalid.");
  }

  if (!name || name.length > 255 || containsPathSeparator(name)) {
    throw new SourceFileUploadValidationError("The file name is invalid.");
  }

  if (pathname !== sourceFileUploadPath(uploadId, name)) {
    throw new SourceFileUploadValidationError(
      "The upload pathname must match the file name.",
    );
  }

  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > MAX_SOURCE_FILE_SIZE_BYTES
  ) {
    throw new SourceFileUploadValidationError(
      "The file must be between 1 byte and 250 MB.",
    );
  }

  contentTypeForFileName(name);

  return { uploadId, name, size };
}

function parseTokenPayload(
  tokenPayload: string | null | undefined,
): SourceFileUploadTokenPayload {
  const payload = parseJsonObject(
    tokenPayload ?? null,
    "Upload token metadata is missing.",
  );

  if (
    typeof payload.userId !== "string" ||
    !payload.userId ||
    typeof payload.uploadId !== "string" ||
    !isUuid(payload.uploadId)
  ) {
    throw new SourceFileUploadValidationError(
      "Upload token metadata is invalid.",
    );
  }

  return {
    userId: payload.userId,
    uploadId: payload.uploadId,
  };
}

function contentTypeForFileName(fileName: string): SourceFileContentType {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const contentType = extension
    ? CONTENT_TYPE_BY_EXTENSION[extension as keyof typeof CONTENT_TYPE_BY_EXTENSION]
    : undefined;

  if (!contentType) {
    throw new SourceFileUploadValidationError(
      "Only PDF, PPTX, and DOCX files are supported.",
    );
  }

  return contentType;
}

function parseJsonObject(
  value: string | null,
  missingMessage: string,
): Record<string, unknown> {
  if (!value) {
    throw new SourceFileUploadValidationError(missingMessage);
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The shared error below keeps malformed and non-object payloads consistent.
  }

  throw new SourceFileUploadValidationError(missingMessage);
}

function isTokenRequest(
  body: HandleUploadPresignedBody,
): boolean {
  return body.type === "blob.generate-presigned-url";
}

function isUploadRequestBody(
  value: unknown,
): value is HandleUploadPresignedBody {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  return (
    value.type === "blob.generate-presigned-url" ||
    value.type === "blob.upload-completed"
  );
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function containsPathSeparator(fileName: string): boolean {
  return fileName.includes("/") || fileName.includes("\\");
}

function sourceFileUploadPath(uploadId: string, fileName: string): string {
  return `source-uploads/${uploadId}/${fileName}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
