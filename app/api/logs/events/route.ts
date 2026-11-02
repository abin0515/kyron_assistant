import { NextRequest } from "next/server";

import { parsePageRequest } from "@/server/http/pagination";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson, parseEventFilter } from "@/server/logging/http";
import { getLogEvents } from "@/server/logging/service";
import type { LogEventListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUserRole("admin", "developer");

    const searchParams = request.nextUrl.searchParams;

    return logsJson(
      (await getLogEvents(parseEventFilter(searchParams), parsePageRequest(searchParams))) satisfies LogEventListResponse,
    );
  } catch (error) {
    return logsErrorResponse(error, "Log event list failed");
  }
}
