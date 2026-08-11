import { NextRequest, NextResponse } from "next/server";

import {
  deleteCurrentUserDraftWorkspace,
  getCurrentUserDraftWorkspace,
  updateCurrentUserDraftWorkspace,
} from "@/server/drafts/workspaces/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  ASSET_TYPES,
  COURSE_BRIEF_MAX_LENGTH,
  COURSE_FIELD_LIMITS,
  DURATIONS,
  type UpdateDraftWorkspaceRequest,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftWorkspaceRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: DraftWorkspaceRouteContext,
) {
  const id = await readWorkspaceId(context);

  if (!id) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  try {
    const workspace = await getCurrentUserDraftWorkspace(id);

    if (!workspace) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(workspace, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft workspace request failed",
      fallbackMessage: "The draft workspace could not be loaded.",
      retryable: true,
    });
  }
}

export async function PATCH(
  request: NextRequest,
  context: DraftWorkspaceRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readWorkspaceId(context);

  if (!id) {
    return requestErrorResponse("Draft workspace ID is invalid.");
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

  const parsedRequest = parseWorkspaceUpdate(requestBody);

  if (!parsedRequest.data) {
    return validationErrorResponse(parsedRequest.errors ?? {});
  }

  try {
    const workspace = await updateCurrentUserDraftWorkspace(
      id,
      parsedRequest.data,
    );

    if (!workspace) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(workspace, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft workspace update failed",
      fallbackMessage: "The draft workspace could not be saved.",
      retryable: true,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: DraftWorkspaceRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readWorkspaceId(context);

  if (!id) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  try {
    const result = await deleteCurrentUserDraftWorkspace(id);

    if (result === "not_found") {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    if (result === "not_allowed") {
      return conflictErrorResponse(
        "Only unsubmitted draft workspaces can be deleted.",
        false,
      );
    }

    return new NextResponse(null, {
      status: 204,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft workspace deletion failed",
      fallbackMessage: "The draft workspace could not be deleted.",
      retryable: true,
    });
  }
}

async function readWorkspaceId(
  context: DraftWorkspaceRouteContext,
): Promise<string | null> {
  const { id } = await context.params;

  return isUuid(id) ? id : null;
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

function parseWorkspaceUpdate(value: unknown): {
  data?: UpdateDraftWorkspaceRequest;
  errors?: Record<string, string[]>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      errors: { request: ["Request body must be an object."] },
    };
  }

  const input = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const data: UpdateDraftWorkspaceRequest = {};

  readTextField(input, data, errors, "sourceText", COURSE_BRIEF_MAX_LENGTH);
  readTextField(input, data, errors, "name", COURSE_FIELD_LIMITS.name);
  readTextField(
    input,
    data,
    errors,
    "description",
    COURSE_FIELD_LIMITS.description,
  );
  readTextField(
    input,
    data,
    errors,
    "learningObjective",
    COURSE_FIELD_LIMITS.learningObjective,
  );
  readTextField(
    input,
    data,
    errors,
    "audience",
    COURSE_FIELD_LIMITS.audience,
  );

  if ("assetType" in input) {
    if (!ASSET_TYPES.includes(input.assetType as never)) {
      errors.assetType = ["Unsupported asset type."];
    } else {
      data.assetType = input.assetType as UpdateDraftWorkspaceRequest["assetType"];
    }
  }

  if ("duration" in input) {
    if (!DURATIONS.includes(input.duration as never)) {
      errors.duration = ["Unsupported duration."];
    } else {
      data.duration = input.duration as UpdateDraftWorkspaceRequest["duration"];
    }
  }

  if (Object.keys(data).length === 0 && Object.keys(errors).length === 0) {
    errors.request = ["At least one editable field is required."];
  }

  return Object.keys(errors).length > 0 ? { errors } : { data };
}

function readTextField(
  input: Record<string, unknown>,
  data: UpdateDraftWorkspaceRequest,
  errors: Record<string, string[]>,
  field:
    | "sourceText"
    | "name"
    | "description"
    | "learningObjective"
    | "audience",
  maxLength: number,
): void {
  if (!(field in input)) {
    return;
  }

  const value = input[field];

  if (typeof value !== "string") {
    errors[field] = [`${field} must be a string.`];
  } else if (value.length > maxLength) {
    errors[field] = [`${field} must be ${maxLength} characters or fewer.`];
  } else {
    data[field] = value;
  }
}
