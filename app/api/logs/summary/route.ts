import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson } from "@/server/logging/http";
import { getLogSummary } from "@/server/logging/service";
import type { LogSummaryResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin", "developer");

    return logsJson((await getLogSummary()) satisfies LogSummaryResponse);
  } catch (error) {
    return logsErrorResponse(error, "Log summary failed");
  }
}
