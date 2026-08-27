import { NextRequest, NextResponse } from "next/server";

import {
  BatchValidationError,
  BatchWorkspaceNotFoundError,
  reviewCurrentUserBatchWorkspace,
} from "@/server/batches/service";
import {
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  ASSET_TYPES,
  COURSE_FIELD_LIMITS,
  DURATIONS,
  type CourseSetup,
  type DraftBatchResponse,
  type ReviewBatchWorkspaceRequest,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchWorkspaceRouteContext = {
  params: Promise<{ id: string; workspaceId: string }>;
};

export async function PATCH(
  request: NextRequest,
  context: BatchWorkspaceRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id, workspaceId } = await context.params;

  if (!isUuid(id) || !isUuid(workspaceId)) {
    return requestErrorResponse("Batch or workspace ID is invalid.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return requestErrorResponse("Request body must be valid JSON.");
  }

  const parsed = parseReviewRequest(body);

  if ("errors" in parsed) {
    return validationErrorResponse(parsed.errors);
  }

  try {
    const batch = await reviewCurrentUserBatchWorkspace(
      id,
      workspaceId,
      parsed.input,
      parsed.attachToKyron,
    );

    if (!batch) {
      return notFoundErrorResponse("Batch was not found.");
    }

    return NextResponse.json({ batch } satisfies DraftBatchResponse, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof BatchWorkspaceNotFoundError) {
      return notFoundErrorResponse(error.message);
    }

    if (error instanceof BatchValidationError) {
      return requestErrorResponse(error.message, 422);
    }

    return internalErrorResponse(error, {
      context: "Batch workspace review failed",
      fallbackMessage: "The batch workspace could not be saved.",
      retryable: true,
    });
  }
}

function parseReviewRequest(
  value: unknown,
):
  | { input: CourseSetup; attachToKyron: boolean }
  | { errors: Record<string, string[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const input = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const name = readRequiredText(input, "name", COURSE_FIELD_LIMITS.name, errors);
  const description = readRequiredText(
    input,
    "description",
    COURSE_FIELD_LIMITS.description,
    errors,
  );
  const learningObjective = readRequiredText(
    input,
    "learningObjective",
    COURSE_FIELD_LIMITS.learningObjective,
    errors,
  );
  const audience = readRequiredText(
    input,
    "audience",
    COURSE_FIELD_LIMITS.audience,
    errors,
  );

  if (!ASSET_TYPES.includes(input.assetType as never)) {
    errors.assetType = ["Unsupported asset type."];
  }
  if (!DURATIONS.includes(input.duration as never)) {
    errors.duration = ["Unsupported duration."];
  }
  if (typeof input.attachToKyron !== "boolean") {
    errors.attachToKyron = ["attachToKyron must be a boolean."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const request = input as unknown as ReviewBatchWorkspaceRequest;
  return {
    input: {
      name,
      description,
      learningObjective,
      audience,
      assetType: request.assetType,
      duration: request.duration,
    },
    attachToKyron: request.attachToKyron,
  };
}

function readRequiredText(
  input: Record<string, unknown>,
  field: "name" | "description" | "learningObjective" | "audience",
  maxLength: number,
  errors: Record<string, string[]>,
): string {
  const value = input[field];

  if (typeof value !== "string" || !value.trim()) {
    errors[field] = [`${field} is required.`];
    return "";
  }

  if (value.length > maxLength) {
    errors[field] = [`${field} must be ${maxLength} characters or fewer.`];
  }

  return value.trim();
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  try {
    return Boolean(origin && new URL(origin).origin === request.nextUrl.origin);
  } catch {
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
