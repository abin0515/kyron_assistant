import { requestErrorResponse } from "@/server/http/api-response";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { getRunDetail } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: QaRouteContext<{ id: string }>) {
  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Run ID is invalid.");
  }

  try {
    return qaJson((await getRunDetail(id, await getCurrentUser())) satisfies QaRunDetailResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA run detail failed");
  }
}
