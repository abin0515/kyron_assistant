import { NextResponse } from "next/server";

import { kyronMcpErrorResponse, noStoreHeaders, requestErrorResponse } from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { parseKyronDraftId } from "@/server/kyron-content/draft-id";
import { getKyronDraftRevisions } from "@/server/kyron-content/revisions";
import type { KyronDraftRevisionsResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// The QA agent's revisions of one draft, from the database.
export async function GET(_request: Request, context: RouteContext) {
  const draftId = parseKyronDraftId((await context.params).id);

  if (!draftId) {
    return requestErrorResponse("Kyron draft ID is invalid.");
  }

  try {
    await requireCurrentUserRole("admin");

    return NextResponse.json(
      (await getKyronDraftRevisions(draftId)) satisfies KyronDraftRevisionsResponse,
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron draft revisions failed",
      fallbackMessage: "The QA revisions could not be loaded.",
    });
  }
}
