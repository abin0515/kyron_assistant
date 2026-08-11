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
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  const response = await fetch("/api/drafts", {
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
  signal?: AbortSignal,
): Promise<DraftListResponse> {
  const response = await fetch("/api/drafts/sync", {
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
