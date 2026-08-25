import { NextRequest, NextResponse } from "next/server";

import {
  DraftWorkspaceSubmissionError,
  submitCurrentUserDraftWorkspace,
} from "@/server/drafts/workspaces/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  kyronErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  uploadFailedErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import { KyronClientError } from "@/server/kyron/client";
import { KyronAttachmentTransferError } from "@/server/drafts/workspace-source-files/kyron-attachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SubmitDraftWorkspaceRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: SubmitDraftWorkspaceRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readWorkspaceId(context);

  if (!id) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  try {
    const workspace = await submitCurrentUserDraftWorkspace(id);

    if (!workspace) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(workspace, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return submissionErrorResponse(error);
  }
}

function submissionErrorResponse(error: unknown) {
  if (error instanceof DraftWorkspaceSubmissionError) {
    if (error.code === "INVALID_WORKSPACE") {
      return validationErrorResponse(error.fieldErrors ?? {});
    }

    return conflictErrorResponse(error.message);
  }

  if (error instanceof KyronClientError) {
    return kyronErrorResponse(error, {
      context: "Kyron workspace submission failed",
      fallbackMessage: "The Kyron draft could not be created.",
    });
  }

  if (error instanceof KyronAttachmentTransferError) {
    return uploadFailedErrorResponse(error.message, error.retryable);
  }

  return internalErrorResponse(error, {
    context: "Draft workspace submission failed",
    fallbackMessage: "The draft workspace could not be submitted.",
    retryable: true,
  });
}

async function readWorkspaceId(
  context: SubmitDraftWorkspaceRouteContext,
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
