import { NextRequest, NextResponse } from "next/server";

import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";
import { deleteCurrentUserSourceFileRecord } from "@/server/source-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceFileRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(
  request: NextRequest,
  context: SourceFileRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readSourceFileId(context);

  if (!id) {
    return requestErrorResponse("Source file ID is invalid.");
  }

  try {
    const result = await deleteCurrentUserSourceFileRecord(id);

    if (result.status === "not_found") {
      return notFoundErrorResponse("Source file was not found.");
    }

    if (result.status === "in_use") {
      return conflictErrorResponse(
        "Remove this source file from its draft workspaces before deleting it.",
        false,
      );
    }

    return new NextResponse(null, {
      status: 204,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Source file deletion failed",
      fallbackMessage: "The source file could not be deleted.",
      retryable: true,
    });
  }
}

async function readSourceFileId(
  context: SourceFileRouteContext,
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
