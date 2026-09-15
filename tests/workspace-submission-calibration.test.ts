import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/drafts/workspaces/repository", () => ({
  createDraftWorkspace: vi.fn(),
  deleteDraftWorkspace: vi.fn(),
  failDraftWorkspaceSubmission: vi.fn(),
  getDraftWorkspaceById: vi.fn(),
  listDraftWorkspacesByUser: vi.fn(),
  startDraftWorkspaceSubmission: vi.fn(),
  updateDraftWorkspace: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup-calibrations/repository", () => ({
  completeWorkspaceSubmissionWithCalibration: vi.fn(),
  getCourseSetupCalibration: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup-calibrations/service", () => ({
  hydrateCourseSetupCalibration: vi.fn(
    async (workspace: unknown) => workspace,
  ),
}));
vi.mock("@/server/drafts/workspace-source-files/kyron-attachment", () => ({
  uploadWorkspaceAttachmentToKyron: vi.fn(),
}));
vi.mock("@/server/drafts/kyron-drafts/service", () => ({
  createDraftWithRequiredPersistence: vi.fn(),
}));
vi.mock("@/server/identity/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

import {
  completeWorkspaceSubmissionWithCalibration,
  getCourseSetupCalibration,
} from "@/server/drafts/course-setup-calibrations/repository";
import { createDraftWithRequiredPersistence } from "@/server/drafts/kyron-drafts/service";
import { uploadWorkspaceAttachmentToKyron } from "@/server/drafts/workspace-source-files/kyron-attachment";
import {
  getDraftWorkspaceById,
  startDraftWorkspaceSubmission,
} from "@/server/drafts/workspaces/repository";
import {
  DraftWorkspaceSubmissionError,
  submitCurrentUserDraftWorkspace,
} from "@/server/drafts/workspaces/service";
import { getCurrentUser } from "@/server/identity/current-user";
import type {
  CourseSetupCalibration,
  Draft,
  DraftWorkspace,
} from "@/types/api";

const user = {
  id: "user_123",
  name: "Tasha Reviewer",
  email: "tasha@example.com",
};
const workspace: DraftWorkspace = {
  id: "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
  status: "editing",
  statusMessage: "",
  sourceText: "",
  name: "  Project Planning  ",
  description: " Build a practical project plan. ",
  learningObjective: " Create a project plan. ",
  audience: " New project managers ",
  assetType: "lesson",
  duration: 900,
  kyronDraftId: null,
  submittedAt: null,
  courseSetupCalibration: null,
  createdBy: user,
  recordCreatedAt: "2026-09-14T12:00:00.000Z",
  recordUpdatedAt: "2026-09-14T12:00:00.000Z",
};
const kyronDraft: Draft = {
  id: 14408,
  name: "Project Planning",
  status: "started",
  statusMessage: "Generating",
  previewUrl: "https://example.com/preview",
  editorUrl: "https://example.com/editor",
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
};
const generatedSetup = {
  name: "Project Planning",
  description: "Build a practical project plan.",
  learningObjective: "Create a project plan.",
  audience: "New project managers",
  assetType: "lesson" as const,
  duration: 900 as const,
};
const reviewedCalibration: CourseSetupCalibration = {
  generatedSetup,
  generatedAt: "2026-09-14T12:00:00.000Z",
  promptVersion: "course-setup-v1",
  model: "gpt-test",
  reviewStatus: "reviewed",
  reviewResult: "approved_as_is",
  reviewedSetup: generatedSetup,
  reviewedBy: user,
  reviewedAt: "2026-09-14T12:05:00.000Z",
  submittedSetup: null,
  submittedAt: null,
  kyronDraftId: null,
};

describe("workspace submission calibration", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getDraftWorkspaceById).mockResolvedValue(workspace);
    vi.mocked(getCourseSetupCalibration).mockResolvedValue(null);
    vi.mocked(startDraftWorkspaceSubmission).mockResolvedValue(workspace);
    vi.mocked(uploadWorkspaceAttachmentToKyron).mockResolvedValue(
      "signed-attachment",
    );
    vi.mocked(createDraftWithRequiredPersistence).mockResolvedValue(kyronDraft);
    vi.mocked(completeWorkspaceSubmissionWithCalibration).mockResolvedValue(
      true,
    );
  });

  it("keeps manual workspace submission working", async () => {
    await submitCurrentUserDraftWorkspace(workspace.id);

    expect(startDraftWorkspaceSubmission).toHaveBeenCalled();
    expect(createDraftWithRequiredPersistence).toHaveBeenCalled();
  });

  it("blocks an AI-generated workspace that still needs review", async () => {
    vi.mocked(getCourseSetupCalibration).mockResolvedValue({
      ...reviewedCalibration,
      reviewStatus: "needs_review",
      reviewResult: null,
      reviewedSetup: null,
      reviewedBy: null,
      reviewedAt: null,
    });

    await expect(
      submitCurrentUserDraftWorkspace(workspace.id),
    ).rejects.toMatchObject({
      code: "REVIEW_REQUIRED",
    } satisfies Partial<DraftWorkspaceSubmissionError>);
    expect(startDraftWorkspaceSubmission).not.toHaveBeenCalled();
  });

  it("snapshots exactly the normalized setup sent to Kyron", async () => {
    vi.mocked(getCourseSetupCalibration).mockResolvedValue(
      reviewedCalibration,
    );

    await submitCurrentUserDraftWorkspace(workspace.id);

    expect(createDraftWithRequiredPersistence).toHaveBeenCalledWith({
      ...generatedSetup,
      alignmentContentSignedId: "signed-attachment",
    });
    expect(completeWorkspaceSubmissionWithCalibration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      kyronDraft.id,
      "Generating",
      generatedSetup,
    );
  });
});
