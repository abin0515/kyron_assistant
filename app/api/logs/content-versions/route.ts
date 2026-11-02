import { NextRequest } from "next/server";

import { parsePageRequest } from "@/server/http/pagination";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson } from "@/server/logging/http";
import { getContentVersionPage } from "@/server/qa/service";
import type { QaContentVersionListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUserRole("admin", "developer");

    return logsJson(
      (await getContentVersionPage(parsePageRequest(request.nextUrl.searchParams))) satisfies QaContentVersionListResponse,
    );
  } catch (error) {
    return logsErrorResponse(error, "Content version list failed");
  }
}
