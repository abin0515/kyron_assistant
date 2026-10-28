import "server-only";

import { randomUUID } from "node:crypto";

import {
  claimCourseSetupGeneration,
  completeCourseSetupGeneration,
  getCourseSetupCalibration,
  markCourseSetupReviewed,
  releaseCourseSetupGeneration,
} from "@/server/drafts/course-setup-calibrations/repository";
import { generateCourseSetupWithMetadata } from "@/server/drafts/course-setup/service";
import { getDraftWorkspaceById } from "@/server/drafts/workspaces/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import type { DraftWorkspace } from "@/types/api";

export async function generateCurrentUserWorkspaceCourseSetup(input: {
  workspaceId: string;
}): Promise<DraftWorkspace> {
  const user = await getCurrentUser();
  const generationToken = randomUUID();
  const claim = await claimCourseSetupGeneration(
    input.workspaceId,
    user.id,
    generationToken,
  );

  if (claim !== "claimed") {
    throw generationClaimError(claim);
  }

  let completed = false;

  try {
    const workspaceBeforeGeneration = await getDraftWorkspaceById(
      input.workspaceId,
      user.id,
    );

    if (!workspaceBeforeGeneration) {
      throw new CourseSetupCalibrationNotFoundError();
    }

    const result = await generateCourseSetupWithMetadata({
      brief: workspaceBeforeGeneration.sourceText,
      workspaceId: input.workspaceId,
    });
    completed = await completeCourseSetupGeneration(
      input.workspaceId,
      user.id,
      generationToken,
      result,
    );

    if (!completed) {
      throw new CourseSetupCalibrationConflictError(
        "The workspace changed while the course setup was being generated. Try again.",
      );
    }

    const workspace = await getDraftWorkspaceById(input.workspaceId, user.id);

    if (!workspace) {
      throw new CourseSetupCalibrationNotFoundError();
    }

    return hydrateCourseSetupCalibration(workspace, user.id);
  } finally {
    if (!completed) {
      await releaseCourseSetupGeneration(
        input.workspaceId,
        user.id,
        generationToken,
      );
    }
  }
}

export async function reviewCurrentUserWorkspaceCourseSetup(
  workspaceId: string,
): Promise<DraftWorkspace> {
  const user = await getCurrentUser();
  const reviewed = await markCourseSetupReviewed(workspaceId, user);

  if (!reviewed) {
    const workspace = await getDraftWorkspaceById(workspaceId, user.id);

    if (!workspace) {
      throw new CourseSetupCalibrationNotFoundError();
    }

    throw new CourseSetupCalibrationConflictError(
      workspace.kyronDraftId
        ? "A submitted workspace cannot change its course setup review."
        : "This workspace does not have an AI-generated setup ready for review.",
    );
  }

  const workspace = await getDraftWorkspaceById(workspaceId, user.id);

  if (!workspace) {
    throw new CourseSetupCalibrationNotFoundError();
  }

  return hydrateCourseSetupCalibration(workspace, user.id);
}

export async function hydrateCourseSetupCalibration(
  workspace: DraftWorkspace,
  userId: string,
): Promise<DraftWorkspace> {
  return {
    ...workspace,
    courseSetupCalibration: await getCourseSetupCalibration(
      workspace.id,
      userId,
    ),
  };
}

export class CourseSetupCalibrationNotFoundError extends Error {
  constructor() {
    super("Draft workspace was not found.");
    this.name = "CourseSetupCalibrationNotFoundError";
  }
}

export class CourseSetupCalibrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseSetupCalibrationConflictError";
  }
}

function generationClaimError(
  claim: Exclude<
    Awaited<ReturnType<typeof claimCourseSetupGeneration>>,
    "claimed"
  >,
): Error {
  if (claim === "not_found") {
    return new CourseSetupCalibrationNotFoundError();
  }

  if (claim === "in_progress") {
    return new CourseSetupCalibrationConflictError(
      "Course setup generation is already in progress.",
    );
  }

  if (claim === "batch_workspace") {
    return new CourseSetupCalibrationConflictError(
      "Batch workspaces use the batch review workflow.",
    );
  }

  return new CourseSetupCalibrationConflictError(
    "A submitted or locked workspace cannot regenerate its course setup.",
  );
}
