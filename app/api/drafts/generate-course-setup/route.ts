import { NextRequest, NextResponse } from "next/server";

import {
  CourseSetupInputError,
  CourseSetupSourceProcessingError,
  CourseSetupWorkspaceNotFoundError,
  generateCourseSetup,
} from "@/server/drafts/course-setup/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  COURSE_BRIEF_MAX_LENGTH,
  type GenerateCourseSetupResponse,
} from "@/types/api";

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
    const suggestion = await generateCourseSetup(parsedRequest.input);
    const response = { suggestion } satisfies GenerateCourseSetupResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof CourseSetupWorkspaceNotFoundError) {
      return notFoundErrorResponse(error.message);
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
  | { input: { brief: string; workspaceId?: string } }
  | { errors: Record<string, string[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const data = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const brief = readOptionalText(data.brief, "brief", errors);
  const workspaceId = readOptionalWorkspaceId(data.workspaceId, errors);

  if (brief.length > COURSE_BRIEF_MAX_LENGTH) {
    errors.brief = [
      `brief must be ${COURSE_BRIEF_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    ];
  }

  if (!brief && !workspaceId) {
    errors.request = [
      "Provide a brief or a draft workspace with AI source files.",
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    input: {
      brief,
      ...(workspaceId ? { workspaceId } : {}),
    },
  };
}

function readOptionalText(
  value: unknown,
  field: string,
  errors: Record<string, string[]>,
): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value !== "string") {
    errors[field] = [`${field} must be a string.`];
    return "";
  }

  return value.trim();
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
