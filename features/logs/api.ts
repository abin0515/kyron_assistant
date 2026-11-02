import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  CreateModelPriceRequest,
  LlmUsageListResponse,
  LogEventListResponse,
  LogSummaryResponse,
  ModelPriceListResponse,
  PurgeLogsRequest,
  PurgeLogsResponse,
  QaContentVersionListResponse,
} from "@/types/api";

export type EventQuery = {
  category: string;
  level: string;
  search: string;
  page: number;
};

export function getLogSummary(signal?: AbortSignal) {
  return getJson<LogSummaryResponse>("/api/logs/summary", signal);
}

export function listLogEvents({ category, level, page, search }: EventQuery, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), per_page: "50" });

  if (category) query.set("category", category);
  if (level) query.set("level", level);
  if (search.trim()) query.set("q", search.trim());

  return getJson<LogEventListResponse>(`/api/logs/events?${query}`, signal);
}

export function listLlmUsage(page: number, signal?: AbortSignal) {
  return getJson<LlmUsageListResponse>(`/api/logs/usage?page=${page}&per_page=50`, signal);
}

export function listContentVersions(page: number, signal?: AbortSignal) {
  return getJson<QaContentVersionListResponse>(`/api/logs/content-versions?page=${page}&per_page=25`, signal);
}

export function listModelPrices(signal?: AbortSignal) {
  return getJson<ModelPriceListResponse>("/api/logs/pricing", signal);
}

export function addModelPrice(request: CreateModelPriceRequest) {
  return postJson<ModelPriceListResponse>("/api/logs/pricing", request);
}

export function purgeLogs(request: PurgeLogsRequest) {
  return postJson<PurgeLogsResponse>("/api/logs/purge", request);
}

export function exportUrl(kind: "events" | "usage" | "versions", format: "csv" | "json"): string {
  return `/api/logs/export?kind=${kind}&format=${format}`;
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });

  return parseJsonResponse<T>(response);
}
