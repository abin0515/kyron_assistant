import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import {
  isRecordId,
  parseDecisionRequest,
  qaErrorResponse,
  qaJson,
  readJson,
  type QaRouteContext,
} from "@/server/qa/http";
import { decideFinding } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: QaRouteContext<{ id: string; findingId: string }>,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { findingId, id } = await context.params;

  if (!isRecordId(id) || !isRecordId(findingId)) {
    return requestErrorResponse("Run or finding ID is invalid.");
  }

  try {
    const user = await requireCurrentUserRole("admin");
    const body = parseDecisionRequest(await readJson(request));

    if (!body) {
      return requestErrorResponse("Choose accept, reject or waive. Rejecting or waiving needs a reason.");
    }

    return qaJson((await decideFinding(id, findingId, body, user)) satisfies QaRunDetailResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA finding decision failed");
  }
}
