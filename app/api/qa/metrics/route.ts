import { getCurrentUser } from "@/server/identity/current-user";
import { qaErrorResponse, qaJson } from "@/server/qa/http";
import { getQaMetrics } from "@/server/qa/service";
import type { QaMetricsResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return qaJson((await getQaMetrics(await getCurrentUser())) satisfies QaMetricsResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA metrics failed");
  }
}
