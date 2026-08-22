import { NextRequest, NextResponse } from "next/server";

import { generateCourseSetup } from "@/server/drafts/course-setup/service";
import {
  internalErrorResponse,
  noStoreHeaders,
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

  if ("error" in parsedRequest) {
    return validationErrorResponse({ brief: [parsedRequest.error] });
  }

  try {
    const suggestion = await generateCourseSetup(parsedRequest.brief);
    const response = { suggestion } satisfies GenerateCourseSetupResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
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
): { brief: string } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Request body must be an object." };
  }

  const brief = (value as Record<string, unknown>).brief;

  if (typeof brief !== "string" || !brief.trim()) {
    return { error: "brief is required." };
  }

  const normalizedBrief = brief.trim();

  if (normalizedBrief.length > COURSE_BRIEF_MAX_LENGTH) {
    return {
      error: `brief must be ${COURSE_BRIEF_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }

  return { brief: normalizedBrief };
}
