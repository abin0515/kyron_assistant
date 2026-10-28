import { NextRequest, NextResponse } from "next/server";

import {
  listCurrentWorkspaceSourceFiles,
  updateCurrentWorkspaceSourceFiles,
  WorkspaceSourceFilesLockedError,
  WorkspaceSourceFilesValidationError,
} from "@/server/drafts/workspace-source-files/service";
import type { WorkspaceSourceFile } from "@/server/drafts/workspace-source-files/types";
import { toSourceFileListItem } from "@/server/source-files/api";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  SOURCE_FILE_USAGES,
  type SourceFileUsagePurpose,
  type UpdateWorkspaceSourceFilesRequest,
  type WorkspaceSourceFileListResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const workspaceId = await readWorkspaceId(context);

  if (!workspaceId) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  try {
    const files = await listCurrentWorkspaceSourceFiles(workspaceId);

    if (!files) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(toResponse(files), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Workspace source file request failed",
      fallbackMessage: "Workspace source files could not be loaded.",
      retryable: true,
    });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const workspaceId = await readWorkspaceId(context);

  if (!workspaceId) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  const parsedRequest = await parseUpdateRequest(request);

  if (!parsedRequest.data) {
    return validationErrorResponse(parsedRequest.errors ?? {});
  }

  try {
    const files = await updateCurrentWorkspaceSourceFiles(
      workspaceId,
      parsedRequest.data.purpose,
      parsedRequest.data.sourceFileIds,
    );

    if (!files) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(toResponse(files), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof WorkspaceSourceFilesLockedError) {
      return conflictErrorResponse(error.message, false);
    }

    if (error instanceof WorkspaceSourceFilesValidationError) {
      return validationErrorResponse({ sourceFileIds: [error.message] });
    }

    return internalErrorResponse(error, {
      context: "Workspace source file update failed",
      fallbackMessage: "Workspace source files could not be saved.",
      retryable: true,
    });
  }
}

function toResponse(
  files: WorkspaceSourceFile[],
): WorkspaceSourceFileListResponse {
  return {
    files: files.map((file) => ({
      ...toSourceFileListItem(file, file.workspaceCount),
      purpose: file.purpose,
      linkedAt: file.linkedAt,
    })),
  };
}

async function parseUpdateRequest(request: NextRequest): Promise<{
  data?: UpdateWorkspaceSourceFilesRequest;
  errors?: Record<string, string[]>;
}> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return { errors: { request: ["Content-Type must be application/json."] } };
  }

  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return { errors: { request: ["Request body must be valid JSON."] } };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const input = value as Record<string, unknown>;
  const purpose = input.purpose;
  const sourceFileIds = input.sourceFileIds;
  const errors: Record<string, string[]> = {};

  if (!SOURCE_FILE_USAGES.includes(purpose as never)) {
    errors.purpose = ["Unsupported source file purpose."];
  }

  if (
    !Array.isArray(sourceFileIds) ||
    sourceFileIds.some((id) => typeof id !== "string" || !isUuid(id))
  ) {
    errors.sourceFileIds = ["sourceFileIds must contain valid source file IDs."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      purpose: purpose as SourceFileUsagePurpose,
      sourceFileIds: [...new Set(sourceFileIds as string[])],
    },
  };
}

async function readWorkspaceId(context: RouteContext): Promise<string | null> {
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
