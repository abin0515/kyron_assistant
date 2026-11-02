import { NextRequest, NextResponse } from "next/server";

import {
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { SESSION_COOKIE_NAME } from "@/server/identity/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders,
  });

  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
