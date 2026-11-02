import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { startSetupQaForCurrentUser } from "@/server/qa/service";
import type { QaWorkspaceQaResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-checks the current course setup, for example after manual edits.
export async function POST(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Workspace ID is invalid.");
  }

  try {
    return qaJson(
      (await startSetupQaForCurrentUser(id, await getCurrentUser())) satisfies QaWorkspaceQaResponse,
      201,
    );
  } catch (error) {
    return qaErrorResponse(error, "Course setup QA could not start");
  }
}
