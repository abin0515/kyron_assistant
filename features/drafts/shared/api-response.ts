import type { ApiErrorCode } from "@/types/api";

export class DraftApiError extends Error {
  readonly code: ApiErrorCode | null;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryable: boolean;

  constructor({
    code = null,
    fieldErrors,
    message,
    retryable,
  }: {
    code?: ApiErrorCode | null;
    fieldErrors?: Record<string, string[]>;
    message: string;
    retryable: boolean;
  }) {
    super(message);
    this.name = "DraftApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }
}

export async function parseJsonResponse<T>(
  response: Response,
): Promise<T> {
  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch {
    throw new DraftApiError({
      message: "The application received an unreadable server response.",
      retryable: false,
    });
  }

  if (!response.ok) {
    throw errorFromResponse(responseBody);
  }

  return responseBody as T;
}

function errorFromResponse(value: unknown): DraftApiError {
  const body = value as {
    error?: {
      code?: unknown;
      fieldErrors?: unknown;
      message?: unknown;
      retryable?: unknown;
    };
  };

  return new DraftApiError({
    code:
      typeof body.error?.code === "string"
        ? (body.error.code as ApiErrorCode)
        : null,
    fieldErrors: readFieldErrors(body.error?.fieldErrors),
    message:
      typeof body.error?.message === "string"
        ? body.error.message
        : "The application received an unexpected server error.",
    retryable: body.error?.retryable === true,
  });
}

function readFieldErrors(
  value: unknown,
): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const errors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(value)) {
    if (
      Array.isArray(messages) &&
      messages.every((message) => typeof message === "string")
    ) {
      errors[field] = messages;
    }
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}
