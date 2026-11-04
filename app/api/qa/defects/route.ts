import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { createReviewerDefect, listDefects, parseDefectRequest } from "@/server/qa/defects";
import { qaErrorResponse, qaJson, readJson } from "@/server/qa/http";
import type { QaDefect, QaDefectListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin", "developer");

    return qaJson({ defects: await listDefects() } satisfies QaDefectListResponse);
  } catch (error) {
    return qaErrorResponse(error, "Defect list failed");
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    const user = await requireCurrentUserRole("admin", "developer");
    const body = parseDefectRequest(await readJson(request));

    if (!body) {
      return requestErrorResponse("Give a stage, category, severity and title.");
    }

    return qaJson((await createReviewerDefect(body, user.name)) satisfies QaDefect, 201);
  } catch (error) {
    return qaErrorResponse(error, "Defect creation failed");
  }
}
