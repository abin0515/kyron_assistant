import { requestErrorResponse } from "@/server/http/api-response";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { getWorkspaceQa } from "@/server/qa/service";
import type { QaWorkspaceQaResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: QaRouteContext<{ id: string }>) {
  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Workspace ID is invalid.");
  }

  try {
    return qaJson((await getWorkspaceQa(id, await getCurrentUser())) satisfies QaWorkspaceQaResponse);
  } catch (error) {
    return qaErrorResponse(error, "Workspace QA lookup failed");
  }
}
