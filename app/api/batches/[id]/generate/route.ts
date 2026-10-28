import { NextRequest, NextResponse } from "next/server";

import { generateCurrentUserBatchSetups } from "@/server/batches/service";
import {
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import type {
  DraftBatchResponse,
  GenerateDraftBatchRequest,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BatchGenerateRouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: BatchGenerateRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isUuid(id)) {
    return requestErrorResponse("Batch ID is invalid.");
  }

  const parsed = await parseRequest(request);

  if ("errors" in parsed) {
    return validationErrorResponse(parsed.errors);
  }

  try {
    const batch = await generateCurrentUserBatchSetups(
      id,
      parsed.input.workspaceIds,
    );

    if (!batch) {
      return notFoundErrorResponse("Batch was not found.");
    }

    return NextResponse.json({ batch } satisfies DraftBatchResponse, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Batch setup generation failed",
      fallbackMessage: "The batch course setups could not be generated.",
      retryable: true,
    });
  }
}

async function parseRequest(
  request: NextRequest,
): Promise<
  | { input: GenerateDraftBatchRequest }
  | { errors: Record<string, string[]> }
> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return { input: {} };
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

  const workspaceIds = (value as Record<string, unknown>).workspaceIds;

  if (workspaceIds === undefined) {
    return { input: {} };
  }

  if (
    !Array.isArray(workspaceIds) ||
    workspaceIds.length > 20 ||
    workspaceIds.some((id) => typeof id !== "string" || !isUuid(id))
  ) {
    return { errors: { workspaceIds: ["workspaceIds must contain valid UUIDs."] } };
  }

  return { input: { workspaceIds: [...new Set(workspaceIds as string[])] } };
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
