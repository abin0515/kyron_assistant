import { NextRequest, NextResponse } from "next/server";

import {
  createCurrentUserDraftWorkspace,
  listCurrentUserDraftWorkspaces,
} from "@/server/drafts/workspaces/service";
import {
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import {
  paginationMeta,
  parsePageRequest,
} from "@/server/http/pagination";
import type { DraftWorkspaceListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const page = parsePageRequest(request.nextUrl.searchParams);
    const result = await listCurrentUserDraftWorkspaces(page);
    const response = {
      workspaces: result.items,
      pagination: paginationMeta(page, result.totalCount),
    } satisfies DraftWorkspaceListResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft workspace list request failed",
      fallbackMessage: "The draft workspace list could not be loaded.",
      retryable: true,
    });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    const workspace = await createCurrentUserDraftWorkspace();

    return NextResponse.json(workspace, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft workspace creation failed",
      fallbackMessage: "The draft workspace could not be created.",
      retryable: true,
    });
  }
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
