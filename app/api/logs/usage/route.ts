import { NextRequest } from "next/server";

import { parsePageRequest } from "@/server/http/pagination";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson } from "@/server/logging/http";
import { getLlmUsage } from "@/server/logging/service";
import type { LlmUsageListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUserRole("admin", "developer");

    return logsJson(
      (await getLlmUsage(parsePageRequest(request.nextUrl.searchParams))) satisfies LlmUsageListResponse,
    );
  } catch (error) {
    return logsErrorResponse(error, "Model usage list failed");
  }
}
