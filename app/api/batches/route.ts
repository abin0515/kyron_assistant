import { NextRequest, NextResponse } from "next/server";

import {
  BatchValidationError,
  createCurrentUserBatch,
  listCurrentUserBatches,
} from "@/server/batches/service";
import {
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  paginationMeta,
  parsePageRequest,
} from "@/server/http/pagination";
import { parseKyronDestination } from "@/server/kyron/destination";
import type {
  CreateDraftBatchRequest,
  DraftBatchListResponse,
  DraftBatchResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const page = parsePageRequest(request.nextUrl.searchParams);
    const result = await listCurrentUserBatches(page);
    const response = {
      batches: result.items,
      pagination: paginationMeta(page, result.totalCount),
    } satisfies DraftBatchListResponse;

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Batch list request failed",
      fallbackMessage: "The batch list could not be loaded.",
      retryable: true,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const body = await readJson(request);
  const parsed = parseCreateBatchRequest(body);

  if ("errors" in parsed) {
    return validationErrorResponse(parsed.errors);
  }

  try {
    const response = {
      batch: await createCurrentUserBatch(
        parsed.input.name,
        parsed.input.sourceFileIds,
        parsed.input.kyronDestination ?? { folderId: null, path: [] },
      ),
    } satisfies DraftBatchResponse;

    return NextResponse.json(response, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return requestErrorResponse(error.message, 422);
    }

    return internalErrorResponse(error, {
      context: "Batch creation failed",
      fallbackMessage: "The batch could not be created.",
      retryable: true,
    });
  }
}

function parseCreateBatchRequest(
  value: unknown,
):
  | { input: CreateDraftBatchRequest }
  | { errors: Record<string, string[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const input = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const sourceFileIds = Array.isArray(input.sourceFileIds)
    ? input.sourceFileIds
    : [];
  const parsedDestination = parseKyronDestination(
    input.kyronDestination ?? { folderId: null, path: [] },
  );

  if (!name || name.length > 120) {
    errors.name = ["Batch name must be between 1 and 120 characters."];
  }

  if (
    sourceFileIds.length === 0 ||
    sourceFileIds.length > 20 ||
    sourceFileIds.some((id) => typeof id !== "string" || !isUuid(id))
  ) {
    errors.sourceFileIds = [
      "Select between 1 and 20 valid Source Library files.",
    ];
  }

  if ("errors" in parsedDestination) {
    errors.kyronDestination = parsedDestination.errors;
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    input: {
      name,
      sourceFileIds: [...new Set(sourceFileIds as string[])],
      kyronDestination:
        "destination" in parsedDestination
          ? parsedDestination.destination
          : undefined,
    },
  };
}

async function readJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
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
