import { NextRequest, NextResponse } from "next/server";

import { getAccessCodes } from "@/server/env";
import {
  noStoreHeaders,
  notFoundErrorResponse,
  rateLimitedErrorResponse,
  requestErrorResponse,
  unauthorizedErrorResponse,
} from "@/server/http/api-response";
import { clientAddress, hasSameOrigin } from "@/server/http/request-origin";
import {
  ACCESS_IDENTITIES,
  resolveAccessCode,
  signInAttemptLimiter,
} from "@/server/identity/access-codes";
import { getAuthMode, getSessionSecret } from "@/server/identity/auth-config";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/server/identity/session-token";
import { logEvent } from "@/server/logging/writer";
import type { AccessCodeSignInResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CODE_LENGTH = 200;

export async function POST(request: NextRequest) {
  if (getAuthMode() !== "access-code") {
    return notFoundErrorResponse("Access-code sign-in is not enabled.");
  }

  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const attemptKey = clientAddress(request);
  const attempt = signInAttemptLimiter.check(attemptKey);

  if (!attempt.allowed) {
    await logEvent({
      category: "auth",
      event: "auth.sign_in.locked",
      level: "warn",
      message: "Access-code sign-in refused while locked out after repeated wrong codes.",
      data: { attemptKey },
    });

    return rateLimitedErrorResponse(
      "Too many incorrect codes. Try again in a minute.",
      attempt.retryAfterSeconds,
    );
  }

  const code = await readAccessCode(request);

  if (!code) {
    return requestErrorResponse("Enter an access code.");
  }

  const role = resolveAccessCode(code, getAccessCodes());

  if (!role) {
    signInAttemptLimiter.recordFailure(attemptKey);
    await logEvent({
      category: "auth",
      event: "auth.sign_in.rejected",
      level: "warn",
      message: "Access-code sign-in rejected: the code did not match.",
      data: { attemptKey },
    });

    return unauthorizedErrorResponse("That access code is not valid.");
  }

  signInAttemptLimiter.reset(attemptKey);

  const identity = ACCESS_IDENTITIES[role];

  await logEvent({
    category: "auth",
    event: "auth.sign_in",
    message: `${identity.name} signed in with the ${role} access code.`,
    actorId: identity.id,
    actorRole: role,
  });

  const token = await createSessionToken(
    { sub: identity.id, role },
    getSessionSecret(),
  );
  const response = NextResponse.json(
    {
      user: { name: identity.name, role },
    } satisfies AccessCodeSignInResponse,
    { headers: noStoreHeaders },
  );

  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(request.nextUrl.protocol === "https:"),
  );

  return response;
}

async function readAccessCode(request: NextRequest): Promise<string | null> {
  try {
    const body: unknown = await request.json();

    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string" &&
      body.code.trim() &&
      body.code.length <= MAX_CODE_LENGTH
    ) {
      return body.code;
    }
  } catch {
    // A malformed body is reported the same way as a missing code.
  }

  return null;
}
