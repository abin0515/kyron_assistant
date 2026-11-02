import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import {
  AuthenticationRequiredError,
  ForbiddenError,
} from "@/server/identity/current-user";

import { KyronMcpError } from "./errors";
import { PENDING_AUTHORIZATION_COOKIE_PATH } from "./service";

const PENDING_AUTHORIZATION_MAX_AGE_SECONDS = 10 * 60;

// The OAuth routes are browser navigations, so failures return to the Kyron
// page with a readable message instead of a JSON error.
export function redirectToKyronPage(
  request: NextRequest,
  outcome: { connected: true } | { error: string },
): NextResponse {
  const url = new URL("/kyron", request.url);

  if ("connected" in outcome) {
    url.searchParams.set("connected", "1");
  } else {
    url.searchParams.set("error", outcome.error);
  }

  return NextResponse.redirect(url);
}

export function redirectForOAuthError(
  request: NextRequest,
  error: unknown,
  context: string,
): NextResponse {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (error instanceof ForbiddenError) {
    return redirectToKyronPage(request, {
      error: "Only the admin can connect Kyron.",
    });
  }

  if (error instanceof KyronMcpError) {
    console.error(context, { code: error.code });

    return redirectToKyronPage(request, { error: error.message });
  }

  console.error(context, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });

  return redirectToKyronPage(request, {
    error: "Kyron could not be connected. Check the server log and try again.",
  });
}

export function pendingAuthorizationCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: PENDING_AUTHORIZATION_COOKIE_PATH,
    maxAge: PENDING_AUTHORIZATION_MAX_AGE_SECONDS,
    secure,
  };
}
