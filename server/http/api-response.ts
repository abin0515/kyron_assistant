import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  AuthenticationRequiredError,
  ForbiddenError,
} from "@/server/identity/current-user";
import { KyronClientError } from "@/server/kyron/client";
import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { logEvent } from "@/server/logging/writer";
import {
  type ApiErrorCode,
  type ApiErrorResponse,
} from "@/types/api";

export const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

function statusForKyronError(code: ApiErrorCode): number {
  switch (code) {
    case "KYRON_NOT_FOUND":
      return 404;
    case "KYRON_CONFLICT":
      return 409;
    case "KYRON_RATE_LIMITED":
    case "KYRON_UNAVAILABLE":
    case "REQUEST_TIMEOUT":
      return 503;
    case "KYRON_UNAUTHORIZED":
    case "KYRON_INVALID_RESPONSE":
      return 502;
    default:
      return 500;
  }
}

export function validationErrorResponse(
  fieldErrors: Record<string, string[]>,
) {
  const response = {
    error: {
      code: "VALIDATION_ERROR",
      message: "The request contains invalid fields.",
      retryable: false,
      fieldErrors,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 400,
    headers: noStoreHeaders,
  });
}

export function requestErrorResponse(
  message: string,
  status = 400,
) {
  const response = {
    error: {
      code: "VALIDATION_ERROR",
      message,
      retryable: false,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status,
    headers: noStoreHeaders,
  });
}

export function notFoundErrorResponse(message: string) {
  const response = {
    error: {
      code: "NOT_FOUND",
      message,
      retryable: false,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 404,
    headers: noStoreHeaders,
  });
}

export function conflictErrorResponse(
  message: string,
  retryable = true,
) {
  const response = {
    error: {
      code: "CONFLICT",
      message,
      retryable,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 409,
    headers: noStoreHeaders,
  });
}

export function uploadFailedErrorResponse(
  message: string,
  retryable = true,
) {
  const response = {
    error: {
      code: "UPLOAD_FAILED",
      message,
      retryable,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 502,
    headers: noStoreHeaders,
  });
}

export function internalErrorResponse(
  error: unknown,
  {
    context,
    fallbackMessage,
    retryable = false,
  }: {
    context: string;
    fallbackMessage: string;
    retryable?: boolean;
  },
) {
  const requestId = randomUUID();

  console.error(context, {
    requestId,
    code: "INTERNAL_ERROR",
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  void logEvent({
    category: "system",
    event: "api.internal_error",
    level: "error",
    message: `${context}: ${error instanceof Error ? error.message : "unknown error"}`,
    requestId,
    data: { errorName: error instanceof Error ? error.name : "UnknownError" },
  });

  const response = {
    error: {
      code: "INTERNAL_ERROR",
      message: fallbackMessage,
      retryable,
      requestId,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: 500,
    headers: noStoreHeaders,
  });
}

export function kyronErrorResponse(
  error: unknown,
  {
    context,
    fallbackMessage,
  }: {
    context: string;
    fallbackMessage: string;
  },
) {
  const requestId = randomUUID();
  const normalized =
    error instanceof KyronClientError
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          upstreamStatus: error.upstreamStatus,
        }
      : {
          code: "INTERNAL_ERROR" as const,
          message: fallbackMessage,
          retryable: false,
          upstreamStatus: undefined,
        };

  console.error(context, {
    requestId,
    code: normalized.code,
    upstreamStatus: normalized.upstreamStatus,
  });

  const response = {
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      requestId,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status: statusForKyronError(normalized.code),
    headers: noStoreHeaders,
  });
}

export function unauthorizedErrorResponse(message = "Sign in to continue.") {
  return simpleErrorResponse("UNAUTHORIZED", message, 401);
}

export function forbiddenErrorResponse(
  message = "Your role does not allow this action.",
) {
  return simpleErrorResponse("FORBIDDEN", message, 403);
}

export function rateLimitedErrorResponse(
  message: string,
  retryAfterSeconds: number,
) {
  const response = simpleErrorResponse("RATE_LIMITED", message, 429, true);
  response.headers.set("Retry-After", String(retryAfterSeconds));

  return response;
}

export function identityErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return unauthorizedErrorResponse();
  }

  if (error instanceof ForbiddenError) {
    return forbiddenErrorResponse(error.message);
  }

  return null;
}

export function kyronMcpErrorResponse(
  error: unknown,
  {
    context,
    fallbackMessage,
  }: {
    context: string;
    fallbackMessage: string;
  },
) {
  const identityResponse = identityErrorResponse(error);

  if (identityResponse) {
    return identityResponse;
  }

  if (!(error instanceof KyronMcpError)) {
    return internalErrorResponse(error, {
      context,
      fallbackMessage,
      retryable: true,
    });
  }

  console.error(context, { code: error.code });

  return simpleErrorResponse(
    error.code,
    error.message,
    statusForKyronMcpError(error.code),
    error.retryable,
  );
}

function statusForKyronMcpError(code: KyronMcpError["code"]): number {
  switch (code) {
    case "KYRON_MCP_NOT_CONFIGURED":
    case "KYRON_MCP_NOT_CONNECTED":
      return 409;
    case "KYRON_MCP_TOOL_NOT_ALLOWED":
      return 403;
    case "KYRON_INVALID_RESPONSE":
      return 502;
    default:
      return 503;
  }
}

function simpleErrorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  retryable = false,
) {
  const response = {
    error: {
      code,
      message,
      retryable,
    },
  } satisfies ApiErrorResponse;

  return NextResponse.json(response, {
    status,
    headers: noStoreHeaders,
  });
}
