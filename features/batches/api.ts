import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  CourseSetup,
  CreateDraftBatchRequest,
  DraftBatch,
  DraftBatchListResponse,
  DraftBatchResponse,
  GenerateDraftBatchRequest,
  UpdateBatchWorkspaceRequest,
} from "@/types/api";

export async function listBatches(
  page = 1,
  signal?: AbortSignal,
): Promise<DraftBatchListResponse> {
  const response = await fetch(
    `/api/batches?page=${page}`,
    requestOptions(signal),
  );
  return parseJsonResponse<DraftBatchListResponse>(response);
}

export async function getBatch(
  id: string,
  signal?: AbortSignal,
): Promise<DraftBatch> {
  const response = await fetch(`/api/batches/${id}`, requestOptions(signal));
  return (await parseJsonResponse<DraftBatchResponse>(response)).batch;
}

export async function createBatch(
  input: CreateDraftBatchRequest,
  signal?: AbortSignal,
): Promise<DraftBatch> {
  const response = await fetch(
    "/api/batches",
    jsonRequest("POST", input, signal),
  );
  return (await parseJsonResponse<DraftBatchResponse>(response)).batch;
}

export async function generateBatchSetups(
  id: string,
  input: GenerateDraftBatchRequest = {},
  signal?: AbortSignal,
): Promise<DraftBatch> {
  const response = await fetch(
    `/api/batches/${id}/generate`,
    jsonRequest("POST", input, signal),
  );
  return (await parseJsonResponse<DraftBatchResponse>(response)).batch;
}

export async function updateBatchWorkspace(
  batchId: string,
  workspaceId: string,
  setup: CourseSetup,
  attachToKyron: boolean,
  includeInCalibration: boolean,
  signal?: AbortSignal,
): Promise<DraftBatch> {
  const body = {
    ...setup,
    attachToKyron,
    includeInCalibration,
  } satisfies UpdateBatchWorkspaceRequest;
  const response = await fetch(
    `/api/batches/${batchId}/workspaces/${workspaceId}`,
    jsonRequest("PATCH", body, signal),
  );
  return (await parseJsonResponse<DraftBatchResponse>(response)).batch;
}

export async function deleteBatch(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/batches/${id}`, {
    ...requestOptions(signal),
    method: "DELETE",
  });

  if (!response.ok) {
    await parseJsonResponse<never>(response);
  }
}

function requestOptions(signal?: AbortSignal): RequestInit {
  return {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  };
}

function jsonRequest(
  method: "POST" | "PATCH",
  body: unknown,
  signal?: AbortSignal,
): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  };
}
