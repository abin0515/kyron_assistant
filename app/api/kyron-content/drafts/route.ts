import { NextResponse } from "next/server";

import { kyronMcpErrorResponse, noStoreHeaders } from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { listDraftSummaries } from "@/server/kyron-content/repository";
import type { KyronContentDraftListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The launcher's drafts with how much QA changed in each (database only).
export async function GET() {
  try {
    await requireCurrentUserRole("admin");

    return NextResponse.json(
      { drafts: await listDraftSummaries() } satisfies KyronContentDraftListResponse,
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron content draft list failed",
      fallbackMessage: "The drafts could not be loaded.",
    });
  }
}
