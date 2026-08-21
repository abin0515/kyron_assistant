import { NextRequest, NextResponse } from "next/server";

import {
  syncCurrentUserDrafts,
  syncCurrentUserGeneratingDrafts,
} from "@/server/drafts/kyron-drafts/service";
import {
  kyronErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import type { DraftListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const scope = request.nextUrl.searchParams.get("scope");

  if (scope && scope !== "generating") {
    return requestErrorResponse("Draft synchronization scope is invalid.");
  }

  try {
    const drafts =
      scope === "generating"
        ? await syncCurrentUserGeneratingDrafts()
        : await syncCurrentUserDrafts();
    const response = { drafts } satisfies DraftListResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron draft list synchronization failed",
      fallbackMessage: "The draft list could not be synchronized.",
    });
  }
}
