import { NextRequest, NextResponse } from "next/server";

import {
  deleteCurrentUserBatch,
  getCurrentUserBatch,
} from "@/server/batches/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";
import type { DraftBatchResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchRouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: BatchRouteContext) {
  const id = await readBatchId(context);

  if (!id) {
    return requestErrorResponse("Batch ID is invalid.");
  }

  try {
    const batch = await getCurrentUserBatch(id);

    if (!batch) {
      return notFoundErrorResponse("Batch was not found.");
    }

    return NextResponse.json({ batch } satisfies DraftBatchResponse, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Batch request failed",
      fallbackMessage: "The batch could not be loaded.",
      retryable: true,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: BatchRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readBatchId(context);

  if (!id) {
    return requestErrorResponse("Batch ID is invalid.");
  }

  try {
    const result = await deleteCurrentUserBatch(id);

    if (result === "not_found") {
      return notFoundErrorResponse("Batch was not found.");
    }

    if (result === "not_allowed") {
      return conflictErrorResponse(
        "A batch cannot be deleted while it contains submitted Kyron drafts.",
        false,
      );
    }

    return new NextResponse(null, { status: 204, headers: noStoreHeaders });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Batch deletion failed",
      fallbackMessage: "The batch could not be deleted.",
      retryable: true,
    });
  }
}

async function readBatchId(context: BatchRouteContext) {
  const { id } = await context.params;
  return isUuid(id) ? id : null;
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
