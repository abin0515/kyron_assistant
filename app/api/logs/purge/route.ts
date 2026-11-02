import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson } from "@/server/logging/http";
import { purgeLogs } from "@/server/logging/service";
import type { PurgeLogsResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3_650;

// Deleting logs is permanent, so the request must confirm it explicitly.
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    const user = await requireCurrentUserRole("admin");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const days = body?.olderThanDays;

    if (
      body?.confirm !== true ||
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < MIN_RETENTION_DAYS ||
      days > MAX_RETENTION_DAYS
    ) {
      return requestErrorResponse("Confirm the purge and choose a whole number of days to keep.");
    }

    return logsJson((await purgeLogs(days, user)) satisfies PurgeLogsResponse);
  } catch (error) {
    return logsErrorResponse(error, "Log purge failed");
  }
}
