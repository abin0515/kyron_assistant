import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { advanceRun } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// An open run page advances its run one step at a time; the worker does the
// same for runs nobody is watching.
export async function POST(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Run ID is invalid.");
  }

  try {
    return qaJson((await advanceRun(id, await getCurrentUser())) satisfies QaRunDetailResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA run step failed");
  }
}
