import { NextRequest, NextResponse } from "next/server";

import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";
import { toSourceFileListItem } from "@/server/source-files/api";
import {
  completeCurrentUserSourceFileUpload,
  SourceFileNameConflictError,
  SourceFileUploadSessionNotFoundError,
  SourceFileUploadValidationError,
} from "@/server/source-files/service";
import type {
  CompleteSourceFileUploadRequest,
  CompleteSourceFileUploadResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const upload = await parseRequest(request);

  if (!upload) {
    return requestErrorResponse("The upload completion request is invalid.");
  }

  try {
    const sourceFile = await completeCurrentUserSourceFileUpload(
      upload.uploadId,
      upload.blobUrl,
    );
    const response = {
      file: toSourceFileListItem(sourceFile, 0),
    } satisfies CompleteSourceFileUploadResponse;

    return NextResponse.json(response, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof SourceFileNameConflictError) {
      return conflictErrorResponse(error.message, false);
    }

    if (error instanceof SourceFileUploadSessionNotFoundError) {
      return notFoundErrorResponse(error.message);
    }

    if (error instanceof SourceFileUploadValidationError) {
      return requestErrorResponse(error.message);
    }

    return internalErrorResponse(error, {
      context: "Source file upload completion failed",
      fallbackMessage: "The uploaded file could not be saved to the library.",
      retryable: true,
    });
  }
}

async function parseRequest(
  request: NextRequest,
): Promise<CompleteSourceFileUploadRequest | null> {
  try {
    const value: unknown = await request.json();

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const uploadId = "uploadId" in value ? value.uploadId : undefined;
    const blobUrl = "blobUrl" in value ? value.blobUrl : undefined;

    if (
      typeof uploadId !== "string" ||
      !isUuid(uploadId) ||
      typeof blobUrl !== "string" ||
      !isHttpsUrl(blobUrl)
    ) {
      return null;
    }

    return { uploadId, blobUrl };
  } catch {
    return null;
  }
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

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
