import { NextRequest, NextResponse } from "next/server";

import {
  CourseSetupInputError,
  CourseSetupSourceProcessingError,
  CourseSetupWorkspaceNotFoundError,
} from "@/server/drafts/course-setup/service";
import {
  CourseSetupCalibrationConflictError,
  CourseSetupCalibrationNotFoundError,
  generateCurrentUserWorkspaceCourseSetup,
} from "@/server/drafts/course-setup-calibrations/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import type { GenerateCourseSetupResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const parsedRequest = parseRequest(requestBody);

  if ("errors" in parsedRequest) {
    return validationErrorResponse(parsedRequest.errors);
  }

  try {
    const workspace = await generateCurrentUserWorkspaceCourseSetup(
      parsedRequest.input,
    );
    const response = { workspace } satisfies GenerateCourseSetupResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (
      error instanceof CourseSetupWorkspaceNotFoundError ||
      error instanceof CourseSetupCalibrationNotFoundError
    ) {
      return notFoundErrorResponse(error.message);
    }

    if (error instanceof CourseSetupCalibrationConflictError) {
      return conflictErrorResponse(error.message, false);
    }

    if (error instanceof CourseSetupInputError) {
      return requestErrorResponse(error.message, 422);
    }

    if (error instanceof CourseSetupSourceProcessingError) {
      return conflictErrorResponse(error.message, true);
    }

    return internalErrorResponse(error, {
      context: "AI course setup generation failed",
      fallbackMessage: "The course setup could not be generated.",
      retryable: true,
    });
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

function parseRequest(
  value: unknown,
):
  | { input: { workspaceId: string } }
  | { errors: Record<string, string[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const data = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const workspaceId = readOptionalWorkspaceId(data.workspaceId, errors);

  if (!workspaceId) {
    errors.workspaceId ??= ["workspaceId is required."];
    return { errors };
  }

  return { input: { workspaceId } };
}

function readOptionalWorkspaceId(
  value: unknown,
  errors: Record<string, string[]>,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !isUuid(value.trim())) {
    errors.workspaceId = ["workspaceId must be a valid UUID."];
    return undefined;
  }

  return value.trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
