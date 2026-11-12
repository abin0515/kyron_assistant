import { issueSignedToken, type IssuedSignedToken } from "@vercel/blob";
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
  BLOB_SETUP_MESSAGE,
  blobUploadsConfigured,
  isMissingBlobCredentials,
} from "@/server/source-files/blob-setup";
import {
  cancelCurrentUserSourceFileUpload,
  prepareCurrentUserSourceFileUpload,
  SourceFileNameConflictError,
  SourceFileUploadInProgressError,
  SourceFileUploadValidationError,
} from "@/server/source-files/service";
import type { SourceFileContentType } from "@/server/source-files/types";
import type { ApiErrorResponse, SourceFileUploadClientPayload } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SOURCE_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const UPLOAD_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

// Asked by the page before it uploads: the Blob library hides this route's
// own answers from the browser, so a missing setup is reported here.
export async function GET() {
  return blobUploadsConfigured()
    ? new NextResponse(null, { status: 204, headers: noStoreHeaders })
    : uploadsNotSetUpResponse();
}

// Hands the browser a token to upload one file straight to Vercel Blob. The
// upload is finished by POST /api/source-files/complete; no Blob callback is
// registered (Vercel calls it without a session, and /complete already does
// the work).
export async function POST(request: NextRequest) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return requestErrorResponse("The upload request must contain JSON.");
  }

  if (!isTokenRequestBody(requestBody)) {
    return requestErrorResponse("The upload request is invalid.");
  }

  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  if (!blobUploadsConfigured()) {
    return uploadsNotSetUpResponse();
  }

  try {
    const response = await handleUploadPresigned({
      body: requestBody,
      request,
      getSignedToken: createUploadToken,
    });

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (isMissingBlobCredentials(error)) {
      return uploadsNotSetUpResponse();
    }

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
  await prepareCurrentUserSourceFileUpload({
    id: upload.uploadId,
    originalName: upload.name,
    blobPathname: pathname,
    contentType,
    declaredByteSize: upload.size,
    expiresAt: new Date(validUntil).toISOString(),
  });

  let token: IssuedSignedToken;

  try {
    token = await issueSignedToken({
      pathname,
      operations: ["put"],
      allowedContentTypes: [contentType],
      maximumSizeInBytes: MAX_SOURCE_FILE_SIZE_BYTES,
      validUntil,
    });
  } catch (error) {
    // Nothing will be uploaded, so the file's name is freed at once.
    await cancelCurrentUserSourceFileUpload(upload.uploadId).catch(() => undefined);
    throw error;
  }

  return {
    token,
    urlOptions: {
      allowedContentTypes: [contentType],
      maximumSizeInBytes: MAX_SOURCE_FILE_SIZE_BYTES,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
    },
  };
}

function uploadsNotSetUpResponse() {
  const body = {
    error: { code: "UPLOAD_FAILED", message: BLOB_SETUP_MESSAGE, retryable: false },
  } satisfies ApiErrorResponse;

  return NextResponse.json(body, { status: 503, headers: noStoreHeaders });
}

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

// Only token requests come here: no upload-completed callback is registered.
function isTokenRequestBody(
  value: unknown,
): value is HandleUploadPresignedBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "blob.generate-presigned-url"
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
