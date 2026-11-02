import { NextRequest, NextResponse } from "next/server";

import {
  DraftWorkspaceDestinationError,
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
import { QaSubmissionGateError } from "@/server/qa/service";
import type {
  ApiErrorResponse,
  SubmitDraftWorkspaceRequest,
} from "@/types/api";

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

  const parsedRequest = await readSubmitRequest(request);

  if (!parsedRequest.data) {
    return validationErrorResponse(parsedRequest.errors ?? {});
  }

  try {
    const workspace = await submitCurrentUserDraftWorkspace(
      id,
      parsedRequest.data.includeInCalibration,
      parsedRequest.data.qaOverride ?? false,
    );

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

async function readSubmitRequest(request: NextRequest): Promise<{
  data?: SubmitDraftWorkspaceRequest;
  errors?: Record<string, string[]>;
}> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return {
      errors: { request: ["Content-Type must be application/json."] },
    };
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

  const includeInCalibration = (
    value as Record<string, unknown>
  ).includeInCalibration;

  if (typeof includeInCalibration !== "boolean") {
    return {
      errors: {
        includeInCalibration: [
          "includeInCalibration must be a boolean.",
        ],
      },
    };
  }

  const qaOverride = (value as Record<string, unknown>).qaOverride;

  if (qaOverride !== undefined && typeof qaOverride !== "boolean") {
    return { errors: { qaOverride: ["qaOverride must be a boolean."] } };
  }

  return { data: { includeInCalibration, qaOverride: qaOverride === true } };
}

function submissionErrorResponse(error: unknown) {
  if (error instanceof QaSubmissionGateError) {
    return qaGateErrorResponse(error);
  }

  if (error instanceof DraftWorkspaceDestinationError) {
    return conflictErrorResponse(error.message, false);
  }

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

function qaGateErrorResponse(error: QaSubmissionGateError) {
  const response = {
    error: {
      code: error.reason === "checking" ? "QA_CHECKING" : "QA_BLOCKED",
      message: error.message,
      retryable: error.reason === "checking",
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 409,
    headers: noStoreHeaders,
  });
}
