import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  QaAuditRequest,
  QaDomain,
  QaEscalationListResponse,
  QaFindingDecisionRequest,
  QaHumanCheckRequest,
  QaMetricsResponse,
  QaRubricListResponse,
  QaRunDetailResponse,
  QaRunListResponse,
  QaWorkspaceQaResponse,
} from "@/types/api";

export function listQaRuns(signal?: AbortSignal) {
  return getJson<QaRunListResponse>("/api/qa/runs", signal);
}

export function getWorkspaceQa(workspaceId: string, signal?: AbortSignal) {
  return getJson<QaWorkspaceQaResponse>(`/api/qa/workspaces/${workspaceId}`, signal);
}

export function startWorkspaceSetupCheck(workspaceId: string) {
  return postJson<QaWorkspaceQaResponse>(`/api/qa/workspaces/${workspaceId}/setup-check`, {});
}

export function submitWorkspaceLessonContent(workspaceId: string, packet: unknown) {
  return postJson<QaWorkspaceQaResponse>(`/api/qa/workspaces/${workspaceId}/lesson-content`, {
    packet,
  });
}

export function getQaMetrics(signal?: AbortSignal) {
  return getJson<QaMetricsResponse>("/api/qa/metrics", signal);
}

export function getQaRun(runId: string, signal?: AbortSignal) {
  return getJson<QaRunDetailResponse>(`/api/qa/runs/${runId}`, signal);
}

export function listQaEscalations(signal?: AbortSignal) {
  return getJson<QaEscalationListResponse>("/api/qa/escalations", signal);
}

export function listQaRubrics(signal?: AbortSignal) {
  return getJson<QaRubricListResponse>("/api/qa/rubrics", signal);
}

export function rerunQaRun(runId: string) {
  return postJson<QaRunDetailResponse>(`/api/qa/runs/${runId}/rerun`, {});
}

export function advanceQaRun(runId: string, signal?: AbortSignal) {
  return postJson<QaRunDetailResponse>(`/api/qa/runs/${runId}/advance`, {}, signal);
}

export function decideQaFinding(
  runId: string,
  findingId: string,
  request: QaFindingDecisionRequest,
) {
  return postJson<QaRunDetailResponse>(
    `/api/qa/runs/${runId}/findings/${findingId}/decision`,
    request,
  );
}

export function recordQaHumanCheck(
  runId: string,
  criterionId: string,
  request: QaHumanCheckRequest,
) {
  return postJson<QaRunDetailResponse>(
    `/api/qa/runs/${runId}/human-checks/${criterionId}`,
    request,
  );
}

export function recordQaAudit(runId: string, request: QaAuditRequest) {
  return postJson<QaRunDetailResponse>(`/api/qa/runs/${runId}/audit`, request);
}

export function contentVersionDownloadUrl(versionId: string): string {
  return `/api/qa/content-versions/${versionId}?download=1`;
}

export function approveQaRubric(domain: QaDomain) {
  return postJson<QaRubricListResponse>(`/api/qa/rubrics/${domain}/approve`, {});
}

export async function uploadQaMedia(runId: string, file: File) {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`/api/qa/runs/${runId}/media`, {
    method: "POST",
    body,
    cache: "no-store",
    credentials: "same-origin",
  });

  return parseJsonResponse<QaRunDetailResponse>(response);
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

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<T>(response);
}
