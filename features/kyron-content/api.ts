import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  KyronContentDraftListResponse,
  KyronDraftContentResponse,
  KyronDraftRevisionsResponse,
} from "@/types/api";

export function listKyronContentDrafts(signal?: AbortSignal) {
  return getJson<KyronContentDraftListResponse>("/api/kyron-content/drafts", signal);
}

// Reads the draft live from Kyron (read-only tools).
export function getKyronDraftContent(draftId: number, signal?: AbortSignal) {
  return getJson<KyronDraftContentResponse>(`/api/kyron-content/drafts/${draftId}`, signal);
}

export function getKyronDraftRevisions(draftId: number, signal?: AbortSignal) {
  return getJson<KyronDraftRevisionsResponse>(`/api/kyron-content/drafts/${draftId}/revisions`, signal);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<T>(response);
}
