import "server-only";

import { randomUUID } from "node:crypto";

import {
  completeDraftWorkspaceSubmission,
  createDraftWorkspace,
  deleteDraftWorkspace,
  failDraftWorkspaceSubmission,
  getDraftWorkspaceById,
  listDraftWorkspacesByUser,
  startDraftWorkspaceSubmission,
  updateDraftWorkspace,
} from "@/server/drafts/workspaces/repository";
import { createDraftWithRequiredPersistence } from "@/server/drafts/kyron-drafts/service";
import { getCurrentUser } from "@/server/identity/current-user";
import type {
  CreateDraftRequest,
  DraftWorkspace,
  DraftWorkspaceSummary,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

export async function createCurrentUserDraftWorkspace(): Promise<DraftWorkspace> {
  return createDraftWorkspace(randomUUID(), await getCurrentUser());
}

export async function getCurrentUserDraftWorkspace(
  id: string,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();

  return getDraftWorkspaceById(id, user.id);
}

export async function updateCurrentUserDraftWorkspace(
  id: string,
  input: UpdateDraftWorkspaceRequest,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();

  return updateDraftWorkspace(id, user.id, input);
}

export async function deleteCurrentUserDraftWorkspace(
  id: string,
): Promise<"deleted" | "not_found" | "not_allowed"> {
  const user = await getCurrentUser();
  const workspace = await getDraftWorkspaceById(id, user.id);

  if (!workspace) {
    return "not_found";
  }

  if (
    workspace.kyronDraftId ||
    !["editing", "error"].includes(workspace.status)
  ) {
    return "not_allowed";
  }

  const deleted = await deleteDraftWorkspace(id, user.id);

  return deleted ? "deleted" : "not_allowed";
}

export async function listCurrentUserDraftWorkspaces(): Promise<
  DraftWorkspaceSummary[]
> {
  const user = await getCurrentUser();

  return listDraftWorkspacesByUser(user.id);
}

export async function submitCurrentUserDraftWorkspace(
  id: string,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();
  const workspace = await getDraftWorkspaceById(id, user.id);

  if (!workspace) {
    return null;
  }

  if (workspace.kyronDraftId) {
    return workspace;
  }

  assertWorkspaceCanBeSubmitted(workspace);

  const submittingWorkspace = await startDraftWorkspaceSubmission(
    id,
    user.id,
  );

  if (!submittingWorkspace) {
    return resolveSubmissionRace(id, user.id);
  }

  try {
    const draft = await createDraftWithRequiredPersistence(
      toCreateDraftRequest(submittingWorkspace),
    );
    const submittedWorkspace = await completeDraftWorkspaceSubmission(
      id,
      user.id,
      draft.id,
      submissionStatusMessage(draft.status, draft.statusMessage),
    );

    if (!submittedWorkspace) {
      throw new Error("The submitted workspace could not be updated.");
    }

    return submittedWorkspace;
  } catch (error) {
    await recordSubmissionFailure(id, user.id, error);
    throw error;
  }
}

export class DraftWorkspaceSubmissionError extends Error {
  readonly code: "INVALID_WORKSPACE" | "SUBMISSION_IN_PROGRESS";
  readonly fieldErrors?: Record<string, string[]>;

  constructor({
    code,
    message,
    fieldErrors,
  }: {
    code: DraftWorkspaceSubmissionError["code"];
    message: string;
    fieldErrors?: Record<string, string[]>;
  }) {
    super(message);
    this.name = "DraftWorkspaceSubmissionError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function assertWorkspaceCanBeSubmitted(workspace: DraftWorkspace): void {
  if (workspace.status === "submitting") {
    throw submissionInProgressError();
  }

  const fieldErrors = requiredFieldErrors(workspace);

  if (Object.keys(fieldErrors).length > 0) {
    throw new DraftWorkspaceSubmissionError({
      code: "INVALID_WORKSPACE",
      message: "Complete the required course setup before submitting.",
      fieldErrors,
    });
  }
}

function requiredFieldErrors(
  workspace: DraftWorkspace,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const requiredFields = [
    "name",
    "description",
    "learningObjective",
    "audience",
  ] as const;

  for (const field of requiredFields) {
    if (!workspace[field].trim()) {
      errors[field] = [`${field} is required.`];
    }
  }

  return errors;
}

function toCreateDraftRequest(
  workspace: DraftWorkspace,
): CreateDraftRequest {
  return {
    name: workspace.name.trim(),
    description: workspace.description.trim(),
    learningObjective: workspace.learningObjective.trim(),
    audience: workspace.audience.trim(),
    assetType: workspace.assetType,
    duration: workspace.duration,
  };
}

async function resolveSubmissionRace(
  id: string,
  userId: string,
): Promise<DraftWorkspace> {
  const latestWorkspace = await getDraftWorkspaceById(id, userId);

  if (latestWorkspace?.kyronDraftId) {
    return latestWorkspace;
  }

  throw submissionInProgressError();
}

function submissionInProgressError(): DraftWorkspaceSubmissionError {
  return new DraftWorkspaceSubmissionError({
    code: "SUBMISSION_IN_PROGRESS",
    message: "This draft workspace is already being submitted.",
  });
}

function submissionStatusMessage(
  draftStatus: string,
  kyronMessage: string,
): string {
  return (
    kyronMessage.trim() ||
    `Kyron accepted the draft. Generation status: ${draftStatus}.`
  );
}

async function recordSubmissionFailure(
  id: string,
  userId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : "The Kyron draft could not be created.";

  try {
    await failDraftWorkspaceSubmission(id, userId, message);
  } catch (databaseError) {
    console.error("Draft workspace failure status could not be saved.", {
      workspaceId: id,
      errorName:
        databaseError instanceof Error
          ? databaseError.name
          : "UnknownError",
    });
  }
}
