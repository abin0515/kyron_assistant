import { NextResponse } from "next/server";

import { kyronMcpErrorResponse, noStoreHeaders, requestErrorResponse } from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { parseKyronDraftId } from "@/server/kyron-content/draft-id";
import { readKyronDraftContent } from "@/server/kyron-content/read-draft";
import type { KyronDraftContentResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Reads one draft live through Kyron MCP, with read-only tools only.
export async function GET(_request: Request, context: RouteContext) {
  const draftId = parseKyronDraftId((await context.params).id);

  if (!draftId) {
    return requestErrorResponse("Kyron draft ID is invalid.");
  }

  try {
    await requireCurrentUserRole("admin");

    return NextResponse.json(
      (await readKyronDraftContent(draftId)) satisfies KyronDraftContentResponse,
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron draft content read failed",
      fallbackMessage: "The draft could not be read from Kyron.",
    });
  }
}
