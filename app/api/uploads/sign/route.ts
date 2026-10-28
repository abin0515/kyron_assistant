import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";

import {
  kyronErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import { createKyronFile } from "@/server/kyron/client";
import {
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_CONTENT_TYPE_BY_EXTENSION,
  UPLOAD_CONTENT_TYPES,
  type SignUploadRequest,
  type SignUploadResponse,
  type UploadContentType,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isBase64Md5(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9+/]{22}==$/.test(value)
  ) {
    return false;
  }

  return Buffer.from(value, "base64").byteLength === 16;
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");

  return dotIndex < 0 ? "" : filename.slice(dotIndex).toLowerCase();
}

function parseSignUploadRequest(value: unknown): {
  data?: SignUploadRequest;
  errors?: Record<string, string[]>;
} {
  if (typeof value !== "object" || value === null) {
    return {
      errors: {
        request: ["Request body must be an object."],
      },
    };
  }

  const input = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const filename =
    typeof input.filename === "string" ? input.filename.trim() : "";
  const extension = getExtension(filename);

  if (!filename) {
    errors.filename = ["filename is required."];
  } else if (!(extension in UPLOAD_CONTENT_TYPE_BY_EXTENSION)) {
    errors.filename = ["Only PDF and PPTX files are supported."];
  }

  if (
    typeof input.byteSize !== "number" ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > MAX_UPLOAD_SIZE_BYTES
  ) {
    errors.byteSize = ["byteSize must be between 1 byte and 250 MB."];
  }

  if (!isBase64Md5(input.checksum)) {
    errors.checksum = ["checksum must be a Base64-encoded MD5 digest."];
  }

  if (!UPLOAD_CONTENT_TYPES.includes(input.contentType as never)) {
    errors.contentType = ["Unsupported content type."];
  } else if (
    extension in UPLOAD_CONTENT_TYPE_BY_EXTENSION &&
    input.contentType !==
      UPLOAD_CONTENT_TYPE_BY_EXTENSION[
        extension as keyof typeof UPLOAD_CONTENT_TYPE_BY_EXTENSION
      ]
  ) {
    errors.contentType = ["Content type does not match the file extension."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      filename,
      byteSize: input.byteSize as number,
      checksum: input.checksum as string,
      contentType: input.contentType as UploadContentType,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return requestErrorResponse("Content-Type must be application/json.");
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return requestErrorResponse("Request body must be valid JSON.");
  }

  const parsedRequest = parseSignUploadRequest(requestBody);

  if (!parsedRequest.data) {
    return validationErrorResponse(parsedRequest.errors ?? {});
  }

  try {
    const result = await createKyronFile({
      blob: {
        filename: parsedRequest.data.filename,
        byte_size: parsedRequest.data.byteSize,
        checksum: parsedRequest.data.checksum,
        content_type: parsedRequest.data.contentType,
      },
    });
    const response = {
      signedId: result.signed_id,
      upload: {
        url: result.direct_upload.url,
        headers: result.direct_upload.headers,
      },
    } satisfies SignUploadResponse;

    return NextResponse.json(response, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron upload signing failed",
      fallbackMessage: "The upload could not be prepared.",
    });
  }
}
