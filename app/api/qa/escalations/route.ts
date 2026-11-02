import { requireCurrentUserRole } from "@/server/identity/current-user";
import { qaErrorResponse, qaJson } from "@/server/qa/http";
import { listEscalations } from "@/server/qa/service";
import type { QaEscalationListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin");

    return qaJson({ escalations: await listEscalations() } satisfies QaEscalationListResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA escalation list failed");
  }
}
