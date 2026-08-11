import { NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
} from "@/server/http/api-response";
import { listCurrentUserDrafts } from "@/server/drafts/kyron-drafts/service";
import type { DraftListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drafts = await listCurrentUserDrafts();
    const response = { drafts } satisfies DraftListResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft list request failed",
      fallbackMessage: "The draft list could not be loaded.",
      retryable: true,
    });
  }
}
