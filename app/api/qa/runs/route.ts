import { getCurrentUser } from "@/server/identity/current-user";
import { qaErrorResponse, qaJson } from "@/server/qa/http";
import { listRunSummaries } from "@/server/qa/service";
import type { QaRunListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return qaJson({ runs: await listRunSummaries(await getCurrentUser()) } satisfies QaRunListResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA run list failed");
  }
}
