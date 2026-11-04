import { getCurrentUser } from "@/server/identity/current-user";
import { listProductionJobs } from "@/server/production/service";
import { qaErrorResponse, qaJson } from "@/server/qa/http";
import type { ProductionJobListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return qaJson({ jobs: await listProductionJobs(await getCurrentUser()) } satisfies ProductionJobListResponse);
  } catch (error) {
    return qaErrorResponse(error, "Production job list failed");
  }
}
