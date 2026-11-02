import type { ApiErrorCode } from "@/types/api";

import {
  parseAssetFolder,
  parseAssetFolderList,
  parseFileUpload,
  parseLessonCollection,
  parseOrganization,
  type KyronCreateAssetFolderRequest,
  type KyronCreateFileRequest,
  type KyronCreateLessonCollectionRequest,
  type KyronListAssetFoldersQuery,
} from "./contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type KyronClientErrorCode = Extract<
  ApiErrorCode,
  | "KYRON_UNAUTHORIZED"
  | "KYRON_NOT_FOUND"
  | "KYRON_CONFLICT"
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

export type KyronRequestReport = {
  method: string;
  path: string;
  status: number | null;
  durationMs: number;
  errorCode: string | null;
};

export type KyronClientConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchImplementation?: FetchImplementation;
  // Called once per request for logging; never receives bodies or headers.
  onRequestComplete?: (report: KyronRequestReport) => void;
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

  if (status === 409 || status === 422) {
    return new KyronClientError({
      code: "KYRON_CONFLICT",
      message: "Kyron could not apply the request because it conflicts with the current resource state.",
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
  onRequestComplete,
}: KyronClientConfig) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request<ResponseBody>(
    path: string,
    parseResponse: ResponseParser<ResponseBody>,
    { method = "GET", body }: KyronRequestOptions = {},
  ): Promise<ResponseBody> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const report = (status: number | null, errorCode: string | null) =>
      onRequestComplete?.({
        method,
        path: path.split("?")[0],
        status,
        durationMs: Date.now() - startedAt,
        errorCode,
      });
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
      report(null, controller.signal.aborted ? "REQUEST_TIMEOUT" : "KYRON_UNAVAILABLE");

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

    report(response.status, response.ok ? null : errorForStatus(response.status).code);

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

    async listAssetFolders(query: KyronListAssetFoldersQuery = {}) {
      const searchParams = new URLSearchParams();

      if (query.parent_id !== undefined) {
        searchParams.set("parent_id", String(query.parent_id));
      }

      if (query.page !== undefined) {
        searchParams.set("page", String(query.page));
      }

      if (query.per_page !== undefined) {
        searchParams.set("per_page", String(query.per_page));
      }

      const queryString = searchParams.toString();

      return request(
        `/asset_folders${queryString ? `?${queryString}` : ""}`,
        parseAssetFolderList,
      );
    },

    async createAssetFolder(input: KyronCreateAssetFolderRequest) {
      return request("/asset_folders", parseAssetFolder, {
        method: "POST",
        body: input,
      });
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
