import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  DraftWorkspace,
  DraftWorkspaceListResponse,
  GenerateCourseSetupRequest,
  GenerateCourseSetupResponse,
  UpdateWorkspaceSourceFilesRequest,
  UpdateDraftWorkspaceRequest,
  WorkspaceSourceFileListResponse,
} from "@/types/api";

export async function createDraftWorkspace(
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch("/api/draft-workspaces", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspace>(response);
}

export async function getDraftWorkspace(
  id: string,
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch(`/api/draft-workspaces/${id}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspace>(response);
}

export async function updateDraftWorkspace(
  id: string,
  input: UpdateDraftWorkspaceRequest,
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch(`/api/draft-workspaces/${id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspace>(response);
}

export async function deleteDraftWorkspace(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/draft-workspaces/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    await parseJsonResponse<never>(response);
  }
}

export async function listDraftWorkspaces(
  page = 1,
  signal?: AbortSignal,
): Promise<DraftWorkspaceListResponse> {
  const response = await fetch(`/api/draft-workspaces?page=${page}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspaceListResponse>(response);
}

export async function getWorkspaceSourceFiles(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSourceFileListResponse> {
  const response = await fetch(
    `/api/draft-workspaces/${workspaceId}/source-files`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );

  return parseJsonResponse<WorkspaceSourceFileListResponse>(response);
}

export async function updateWorkspaceSourceFiles(
  workspaceId: string,
  input: UpdateWorkspaceSourceFilesRequest,
  signal?: AbortSignal,
): Promise<WorkspaceSourceFileListResponse> {
  const response = await fetch(
    `/api/draft-workspaces/${workspaceId}/source-files`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );

  return parseJsonResponse<WorkspaceSourceFileListResponse>(response);
}

export async function generateCourseSetup(
  input: GenerateCourseSetupRequest,
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch("/api/drafts/generate-course-setup", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const result = await parseJsonResponse<GenerateCourseSetupResponse>(
    response,
  );

  return result.workspace;
}

export async function markCourseSetupReviewed(
  id: string,
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch(
    `/api/draft-workspaces/${id}/course-setup-review`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );

  return parseJsonResponse<DraftWorkspace>(response);
}

export async function submitDraftWorkspace(
  id: string,
  signal?: AbortSignal,
): Promise<DraftWorkspace> {
  const response = await fetch(`/api/draft-workspaces/${id}/submit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspace>(response);
}
