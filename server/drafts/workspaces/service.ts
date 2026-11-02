import "server-only";

import { randomUUID } from "node:crypto";

import {
  createDraftWorkspace,
  deleteDraftWorkspace,
  failDraftWorkspaceSubmission,
  getDraftWorkspaceById,
  listDraftWorkspacesByUser,
  startDraftWorkspaceSubmission,
  updateDraftWorkspace,
  updateDraftWorkspaceKyronDestination,
} from "@/server/drafts/workspaces/repository";
import {
  completeWorkspaceSubmissionWithCalibration,
} from "@/server/drafts/course-setup-calibrations/repository";
import { hydrateCourseSetupCalibration } from "@/server/drafts/course-setup-calibrations/service";
import type {
  PageRequest,
  PageResult,
} from "@/server/http/pagination";
import type {
  DeleteDraftWorkspaceResult,
} from "@/server/drafts/workspaces/types";
import { uploadWorkspaceAttachmentToKyron } from "@/server/drafts/workspace-source-files/kyron-attachment";
import { createDraftWithRequiredPersistence } from "@/server/drafts/kyron-drafts/service";
import { getCurrentUser } from "@/server/identity/current-user";
import { assertSetupReadyForSubmission } from "@/server/qa/service";
import { logEvent } from "@/server/logging/writer";
import { KyronClientError } from "@/server/kyron/client";
import type {
  CreateDraftRequest,
  CourseSetup,
  DraftWorkspace,
  DraftWorkspaceSummary,
  KyronDestination,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

export async function createCurrentUserDraftWorkspace(): Promise<DraftWorkspace> {
  return createDraftWorkspace(randomUUID(), await getCurrentUser());
}

export async function getCurrentUserDraftWorkspace(
  id: string,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();

  const workspace = await getDraftWorkspaceById(id, user.id);

  return workspace
    ? hydrateCourseSetupCalibration(workspace, user.id)
    : null;
}

export async function updateCurrentUserDraftWorkspace(
  id: string,
  input: UpdateDraftWorkspaceRequest,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();

  const workspace = await updateDraftWorkspace(id, user.id, input);

  return workspace
    ? hydrateCourseSetupCalibration(workspace, user.id)
    : null;
}

export async function updateCurrentUserWorkspaceKyronDestination(
  id: string,
  destination: KyronDestination,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();
  const current = await getDraftWorkspaceById(id, user.id);

  if (!current) {
    return null;
  }

  if (current.kyronDraftId || current.status === "submitting") {
    throw new DraftWorkspaceDestinationError(
      "The Kyron destination cannot be changed after submission starts.",
    );
  }

  const updated = await updateDraftWorkspaceKyronDestination(
    id,
    user.id,
    destination,
  );

  if (!updated) {
    throw new DraftWorkspaceDestinationError(
      "The Kyron destination could not be changed because the workspace state changed.",
    );
  }

  return hydrateCourseSetupCalibration(updated, user.id);
}

export async function deleteCurrentUserDraftWorkspace(
  id: string,
): Promise<DeleteDraftWorkspaceResult> {
  const user = await getCurrentUser();

  return deleteDraftWorkspace(id, user.id);
}

export async function listCurrentUserDraftWorkspaces(
  page: PageRequest,
): Promise<PageResult<DraftWorkspaceSummary>> {
  const user = await getCurrentUser();

  return listDraftWorkspacesByUser(user.id, page);
}

export async function submitCurrentUserDraftWorkspace(
  id: string,
  includeInCalibration = false,
  qaOverride = false,
): Promise<DraftWorkspace | null> {
  const user = await getCurrentUser();
  const workspace = await getDraftWorkspaceById(id, user.id);

  if (!workspace) {
    return null;
  }

  if (workspace.kyronDraftId) {
    return hydrateCourseSetupCalibration(workspace, user.id);
  }

  assertWorkspaceCanBeSubmitted(workspace);
  // Kyron generation starts only from a course setup that passed its quality
  // check (fixes it applies are read back by startDraftWorkspaceSubmission).
  await assertSetupReadyForSubmission({ override: qaOverride, user, workspace });

  const submittingWorkspace = await startDraftWorkspaceSubmission(
    id,
    user.id,
  );

  if (!submittingWorkspace) {
    return resolveSubmissionRace(id, user.id);
  }

  try {
    const alignmentContentSignedId =
      await uploadWorkspaceAttachmentToKyron(id, user.id);
    const draftRequest = toCreateDraftRequest(
      submittingWorkspace,
      alignmentContentSignedId,
    );
    const draft = await createDraftWithRequiredPersistence(draftRequest);

    await logEvent({
      category: "draft",
      event: "draft.submitted",
      message: `Created Kyron draft ${draft.id} for "${draftRequest.name}".`,
      actorId: user.id,
      actorRole: user.role,
      workspaceId: id,
      kyronDraftId: draft.id,
    });
    const completed = await completeWorkspaceSubmissionWithCalibration(
      id,
      user.id,
      draft.id,
      submissionStatusMessage(draft.status, draft.statusMessage),
      toCourseSetupSnapshot(draftRequest),
      includeInCalibration,
    );

    if (!completed) {
      throw new Error("The submitted workspace could not be updated.");
    }

    const submittedWorkspace = await getDraftWorkspaceById(id, user.id);

    if (!submittedWorkspace) {
      throw new Error("The submitted workspace could not be loaded.");
    }

    return hydrateCourseSetupCalibration(submittedWorkspace, user.id);
  } catch (error) {
    const submissionError = normalizeDestinationSubmissionError(
      error,
      submittingWorkspace,
    );
    await recordSubmissionFailure(id, user.id, submissionError);
    throw submissionError;
  }
}

export class DraftWorkspaceDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftWorkspaceDestinationError";
  }
}

export class DraftWorkspaceSubmissionError extends Error {
  readonly code:
    | "INVALID_WORKSPACE"
    | "SUBMISSION_IN_PROGRESS";
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

function assertWorkspaceCanBeSubmitted(
  workspace: DraftWorkspace,
): void {
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
  alignmentContentSignedId: string | null,
): CreateDraftRequest {
  return {
    name: workspace.name.trim(),
    description: workspace.description.trim(),
    learningObjective: workspace.learningObjective.trim(),
    audience: workspace.audience.trim(),
    assetType: workspace.assetType,
    duration: workspace.duration,
    ...(workspace.kyronDestination.folderId
      ? { assetFolderId: workspace.kyronDestination.folderId }
      : {}),
    ...(alignmentContentSignedId
      ? { alignmentContentSignedId }
      : {}),
  };
}

function normalizeDestinationSubmissionError(
  error: unknown,
  workspace: DraftWorkspace,
): unknown {
  if (
    workspace.kyronDestination.folderId &&
    error instanceof KyronClientError &&
    error.code === "KYRON_NOT_FOUND"
  ) {
    return new DraftWorkspaceDestinationError(
      "The selected Kyron folder is no longer available. Choose another destination and try again.",
    );
  }

  return error;
}

function toCourseSetupSnapshot(request: CreateDraftRequest): CourseSetup {
  return {
    name: request.name,
    description: request.description,
    learningObjective: request.learningObjective,
    audience: request.audience,
    assetType: request.assetType,
    duration: request.duration,
  };
}

async function resolveSubmissionRace(
  id: string,
  userId: string,
): Promise<DraftWorkspace> {
  const latestWorkspace = await getDraftWorkspaceById(id, userId);

  if (latestWorkspace?.kyronDraftId) {
    return hydrateCourseSetupCalibration(latestWorkspace, userId);
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
