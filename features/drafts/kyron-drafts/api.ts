import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type { Draft, DraftListResponse } from "@/types/api";

export const POLLING_INTERVAL_MS = 20_000;
export const MAX_CONSECUTIVE_POLLING_FAILURES = 3;

export async function getDraft(
  id: number,
  signal?: AbortSignal,
): Promise<Draft> {
  const response = await fetch(`/api/drafts/${id}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<Draft>(response);
}

export async function listDrafts(
  page = 1,
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  const response = await fetch(`/api/drafts?page=${page}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftListResponse>(response);
}

export async function listDraftsByIds(
  ids: number[],
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  if (ids.length === 0) {
    return {
      drafts: [],
      pagination: {
        page: 1,
        perPage: 0,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const response = await fetch(`/api/drafts?ids=${ids.join(",")}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftListResponse>(response);
}

export async function syncDrafts(
  page = 1,
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  return requestDraftSync(`/api/drafts/sync?page=${page}`, signal);
}

export async function syncGeneratingDrafts(
  page = 1,
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  return requestDraftSync(
    `/api/drafts/sync?scope=generating&page=${page}`,
    signal,
  );
}

async function requestDraftSync(
  url: string,
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftListResponse>(response);
}

export function getPollingDelay(
  consecutiveFailures: number,
  random = Math.random,
): number {
  if (consecutiveFailures <= 0) {
    return POLLING_INTERVAL_MS;
  }

  const baseDelay = Math.min(
    60_000,
    POLLING_INTERVAL_MS * 2 ** consecutiveFailures,
  );
  const jitter = Math.round((random() - 0.5) * baseDelay * 0.2);

  return Math.max(POLLING_INTERVAL_MS, baseDelay + jitter);
}
