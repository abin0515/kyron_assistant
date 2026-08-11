import { NextResponse } from "next/server";

import {
  kyronErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import { syncDraft } from "@/server/drafts/kyron-drafts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: DraftRouteContext,
) {
  const { id: rawId } = await context.params;

  if (
    !/^[1-9]\d*$/.test(rawId) ||
    BigInt(rawId) > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return requestErrorResponse("Draft ID is invalid.");
  }

  try {
    const draft = await syncDraft(Number(rawId));

    return NextResponse.json(draft, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron draft status request failed",
      fallbackMessage: "The Kyron draft status could not be loaded.",
    });
  }
}
