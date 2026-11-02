import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse, logsJson, parsePriceRequest } from "@/server/logging/http";
import { addModelPrice, getModelPrices } from "@/server/logging/service";
import type { ModelPriceListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin", "developer");

    return logsJson((await getModelPrices()) satisfies ModelPriceListResponse);
  } catch (error) {
    return logsErrorResponse(error, "Price list failed");
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    const user = await requireCurrentUserRole("admin");
    const body = parsePriceRequest(await request.json().catch(() => null));

    if (!body) {
      return requestErrorResponse("Enter a model name and non-negative USD prices per 1M tokens.");
    }

    return logsJson((await addModelPrice(body, user)) satisfies ModelPriceListResponse);
  } catch (error) {
    return logsErrorResponse(error, "Price update failed");
  }
}
