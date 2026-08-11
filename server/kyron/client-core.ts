import type { ApiErrorCode } from "@/types/api";

import {
  parseFileUpload,
  parseLessonCollection,
  parseOrganization,
  type KyronCreateFileRequest,
  type KyronCreateLessonCollectionRequest,
} from "./contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type KyronClientErrorCode = Extract<
  ApiErrorCode,
  | "KYRON_UNAUTHORIZED"
  | "KYRON_NOT_FOUND"
  | "KYRON_RATE_LIMITED"
  | "KYRON_UNAVAILABLE"
  | "KYRON_INVALID_RESPONSE"
  | "REQUEST_TIMEOUT"
>;

type FetchImplementation = typeof fetch;
type KyronRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};
type ResponseParser<ResponseBody> = (
  value: unknown,
) => ResponseBody | null;

export type KyronClientConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
};

export class KyronClientError extends Error {
  readonly code: KyronClientErrorCode;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;

  constructor({
    code,
    message,
    retryable,
    upstreamStatus,
  }: {
    code: KyronClientErrorCode;
    message: string;
    retryable: boolean;
    upstreamStatus?: number;
  }) {
    super(message);
    this.name = "KyronClientError";
    this.code = code;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
  }
}

function errorForStatus(status: number): KyronClientError {
  if (status === 401 || status === 403) {
    return new KyronClientError({
      code: "KYRON_UNAUTHORIZED",
      message: "Kyron rejected the configured API credentials.",
      retryable: false,
      upstreamStatus: status,
    });
  }

  if (status === 404) {
    return new KyronClientError({
      code: "KYRON_NOT_FOUND",
      message: "The requested Kyron resource was not found.",
      retryable: false,
      upstreamStatus: status,
    });
  }

  if (status === 429) {
    return new KyronClientError({
      code: "KYRON_RATE_LIMITED",
      message: "Kyron is temporarily rate limiting requests.",
      retryable: true,
      upstreamStatus: status,
    });
  }

  if (status >= 500) {
    return new KyronClientError({
      code: "KYRON_UNAVAILABLE",
      message: "Kyron is temporarily unavailable.",
      retryable: true,
      upstreamStatus: status,
    });
  }

  return new KyronClientError({
    code: "KYRON_INVALID_RESPONSE",
    message: "Kyron returned an unexpected response.",
    retryable: false,
    upstreamStatus: status,
  });
}

export function createKyronClient({
  apiKey,
  baseUrl,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImplementation = fetch,
}: KyronClientConfig) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request<ResponseBody>(
    path: string,
    parseResponse: ResponseParser<ResponseBody>,
    { method = "GET", body }: KyronRequestOptions = {},
  ): Promise<ResponseBody> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      response = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new KyronClientError({
          code: "REQUEST_TIMEOUT",
          message: "The Kyron request timed out.",
          retryable: true,
        });
      }

      throw new KyronClientError({
        code: "KYRON_UNAVAILABLE",
        message: "Kyron could not be reached.",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }

    if (!response.ok) {
      throw errorForStatus(response.status);
    }

    const result = parseResponse(responseBody);

    if (!result) {
      throw new KyronClientError({
        code: "KYRON_INVALID_RESPONSE",
        message: "Kyron returned data that did not match its API contract.",
        retryable: false,
        upstreamStatus: response.status,
      });
    }

    return result;
  }

  return {
    async createFile(input: KyronCreateFileRequest) {
      return request("/files", parseFileUpload, {
        method: "POST",
        body: input,
      });
    },

    async getCurrentOrganization() {
      const response = await request(
        "/organizations/current",
        parseOrganization,
      );

      return response;
    },

    async createLessonCollection(
      input: KyronCreateLessonCollectionRequest,
    ) {
      return request(
        "/lesson_collections",
        parseLessonCollection,
        {
          method: "POST",
          body: input,
        },
      );
    },

    async getLessonCollection(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new TypeError("Kyron lesson collection ID must be positive.");
      }

      return request(
        `/lesson_collections/${id}`,
        parseLessonCollection,
      );
    },
  };
}
