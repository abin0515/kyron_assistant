import { NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";
import { listCurrentUserSourceFileUsages } from "@/server/source-files/service";
import type { SourceFileUsage } from "@/server/source-files/types";
import type {
  SourceFileUsageItem,
  SourceFileUsageResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceFileUsageRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: SourceFileUsageRouteContext,
) {
  const id = await readSourceFileId(context);

  if (!id) {
    return requestErrorResponse("Source file ID is invalid.");
  }

  try {
    const usages = await listCurrentUserSourceFileUsages(id);

    if (!usages) {
      return notFoundErrorResponse("Source file was not found.");
    }

    const response = {
      usages: usages.map(toSourceFileUsageItem),
    } satisfies SourceFileUsageResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Source file usage request failed",
      fallbackMessage: "The source file usage could not be loaded.",
      retryable: true,
    });
  }
}

function toSourceFileUsageItem(usage: SourceFileUsage): SourceFileUsageItem {
  return {
    workspaceId: usage.workspaceId,
    workspaceTitle: usage.workspaceName,
    purpose: usage.purpose,
    state: usage.state,
    linkedAt: usage.recordCreatedAt,
  };
}

async function readSourceFileId(
  context: SourceFileUsageRouteContext,
): Promise<string | null> {
  const { id } = await context.params;

  return isUuid(id) ? id : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
