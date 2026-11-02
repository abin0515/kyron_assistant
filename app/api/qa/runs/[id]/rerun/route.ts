import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { rerunRun } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Run ID is invalid.");
  }

  try {
    return qaJson((await rerunRun(id, await getCurrentUser())) satisfies QaRunDetailResponse, 201);
  } catch (error) {
    return qaErrorResponse(error, "QA re-run failed");
  }
}
