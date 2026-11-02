import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import {
  isRecordId,
  parseHumanCheckRequest,
  qaErrorResponse,
  qaJson,
  readJson,
  type QaRouteContext,
} from "@/server/qa/http";
import { recordHumanCheck } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: QaRouteContext<{ id: string; criterionId: string }>,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { criterionId, id } = await context.params;

  if (!isRecordId(id) || !/^[a-z.-]{1,80}$/.test(criterionId)) {
    return requestErrorResponse("Run or check ID is invalid.");
  }

  try {
    const user = await requireCurrentUserRole("admin");
    const body = parseHumanCheckRequest(await readJson(request));

    if (!body) {
      return requestErrorResponse("Record the check as pass or fail.");
    }

    return qaJson((await recordHumanCheck(id, criterionId, body, user)) satisfies QaRunDetailResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA human check failed");
  }
}
