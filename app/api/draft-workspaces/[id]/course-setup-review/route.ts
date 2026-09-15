import { NextRequest, NextResponse } from "next/server";

import {
  CourseSetupCalibrationConflictError,
  CourseSetupCalibrationNotFoundError,
  reviewCurrentUserWorkspaceCourseSetup,
} from "@/server/drafts/course-setup-calibrations/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: ReviewRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isUuid(id)) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  try {
    const workspace = await reviewCurrentUserWorkspaceCourseSetup(id);

    return NextResponse.json(workspace, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof CourseSetupCalibrationNotFoundError) {
      return notFoundErrorResponse(error.message);
    }

    if (error instanceof CourseSetupCalibrationConflictError) {
      return conflictErrorResponse(error.message, false);
    }

    return internalErrorResponse(error, {
      context: "Course setup review failed",
      fallbackMessage: "The course setup could not be marked as reviewed.",
      retryable: true,
    });
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
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
