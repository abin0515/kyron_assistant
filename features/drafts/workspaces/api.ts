import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  CourseSetup,
  DraftWorkspace,
  DraftWorkspaceListResponse,
  GenerateCourseSetupRequest,
  GenerateCourseSetupResponse,
  UpdateDraftWorkspaceRequest,
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
  signal?: AbortSignal,
): Promise<DraftWorkspaceListResponse> {
  const response = await fetch("/api/draft-workspaces", {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<DraftWorkspaceListResponse>(response);
}

export async function generateCourseSetup(
  brief: string,
  signal?: AbortSignal,
): Promise<CourseSetup> {
  const requestBody = { brief } satisfies GenerateCourseSetupRequest;
  const response = await fetch("/api/drafts/generate-course-setup", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const result = await parseJsonResponse<GenerateCourseSetupResponse>(
    response,
  );

  return result.suggestion;
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
