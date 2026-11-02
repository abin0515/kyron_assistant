import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUserRole } from "@/server/identity/current-user";
import {
  pendingAuthorizationCookieOptions,
  redirectForOAuthError,
} from "@/server/kyron-mcp/oauth-redirects";
import {
  beginKyronAuthorization,
  PENDING_AUTHORIZATION_COOKIE,
} from "@/server/kyron-mcp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUserRole("admin");

    const { authorizationUrl, pendingCookieValue } =
      await beginKyronAuthorization();
    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set(
      PENDING_AUTHORIZATION_COOKIE,
      pendingCookieValue,
      pendingAuthorizationCookieOptions(request.nextUrl.protocol === "https:"),
    );

    return response;
  } catch (error) {
    return redirectForOAuthError(request, error, "Kyron sign-in could not start");
  }
}
