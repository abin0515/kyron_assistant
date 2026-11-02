import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { approveRubricPack, isQaDomain, listRubricPacks } from "@/server/qa/rubrics";
import type { QaRubricListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: QaRouteContext<{ domain: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { domain } = await context.params;

  if (!isQaDomain(domain)) {
    return requestErrorResponse("Unknown rubric domain.");
  }

  try {
    const user = await requireCurrentUserRole("admin");

    await approveRubricPack(domain, user.name);

    return qaJson({ rubrics: await listRubricPacks() } satisfies QaRubricListResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA rubric approval failed");
  }
}
