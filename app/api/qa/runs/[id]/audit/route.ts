import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import {
  isRecordId,
  parseAuditRequest,
  qaErrorResponse,
  qaJson,
  readJson,
  type QaRouteContext,
} from "@/server/qa/http";
import { recordAudit } from "@/server/qa/service";
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
    const user = await requireCurrentUserRole("admin");
    const body = parseAuditRequest(await readJson(request));

    if (!body) {
      return requestErrorResponse("Record the audit as pass or defect found.");
    }

    return qaJson((await recordAudit(id, body, user)) satisfies QaRunDetailResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA audit failed");
  }
}
