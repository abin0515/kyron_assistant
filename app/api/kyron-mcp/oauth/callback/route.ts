import { NextRequest, NextResponse } from "next/server";

import {
  type CurrentUser,
  requireCurrentUserRole,
} from "@/server/identity/current-user";
import {
  pendingAuthorizationCookieOptions,
  redirectForOAuthError,
  redirectToKyronPage,
} from "@/server/kyron-mcp/oauth-redirects";
import {
  completeKyronAuthorization,
  PENDING_AUTHORIZATION_COOKIE,
} from "@/server/kyron-mcp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OAUTH_DETAIL_LENGTH = 200;

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUserRole("admin");
    const response = await finishSignIn(request, user);

    clearPendingAuthorization(request, response);

    return response;
  } catch (error) {
    return redirectForOAuthError(request, error, "Kyron sign-in could not finish");
  }
}

async function finishSignIn(
  request: NextRequest,
  user: CurrentUser,
): Promise<NextResponse> {
  const parameters = request.nextUrl.searchParams;
  const oauthError = parameters.get("error");
  const code = parameters.get("code");
  const state = parameters.get("state");

  if (oauthError) {
    return redirectToKyronPage(request, {
      error: describeOAuthError(oauthError, parameters.get("error_description")),
    });
  }

  if (!code || !state) {
    return redirectToKyronPage(request, {
      error: "Kyron did not return a sign-in code. Try connecting again.",
    });
  }

  await completeKyronAuthorization({
    code,
    state,
    user,
    pendingCookieValue: request.cookies.get(PENDING_AUTHORIZATION_COOKIE)?.value,
  });

  return redirectToKyronPage(request, { connected: true });
}

function clearPendingAuthorization(
  request: NextRequest,
  response: NextResponse,
): void {
  response.cookies.set(PENDING_AUTHORIZATION_COOKIE, "", {
    ...pendingAuthorizationCookieOptions(request.nextUrl.protocol === "https:"),
    maxAge: 0,
  });
}

function describeOAuthError(error: string, description: string | null): string {
  if (error === "access_denied") {
    return "Kyron access was not granted.";
  }

  const detail = description
    ? `: ${description.slice(0, MAX_OAUTH_DETAIL_LENGTH)}`
    : "";

  return `Kyron sign-in was not completed (${error.slice(0, 60)}${detail}).`;
}
