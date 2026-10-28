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
  updateDraftWorkspaceKyronDestination: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup-calibrations/repository", () => ({
  completeWorkspaceSubmissionWithCalibration: vi.fn(),
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
} from "@/server/drafts/course-setup-calibrations/repository";
import { createDraftWithRequiredPersistence } from "@/server/drafts/kyron-drafts/service";
import { uploadWorkspaceAttachmentToKyron } from "@/server/drafts/workspace-source-files/kyron-attachment";
import {
  failDraftWorkspaceSubmission,
  getDraftWorkspaceById,
  startDraftWorkspaceSubmission,
  updateDraftWorkspaceKyronDestination,
} from "@/server/drafts/workspaces/repository";
import {
  submitCurrentUserDraftWorkspace,
  updateCurrentUserWorkspaceKyronDestination,
} from "@/server/drafts/workspaces/service";
import { getCurrentUser } from "@/server/identity/current-user";
import { KyronClientError } from "@/server/kyron/client";
import type { Draft, DraftWorkspace } from "@/types/api";

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
  kyronDestination: { folderId: null, path: [] },
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
describe("workspace submission calibration", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getDraftWorkspaceById).mockResolvedValue(workspace);
    vi.mocked(startDraftWorkspaceSubmission).mockResolvedValue(workspace);
    vi.mocked(uploadWorkspaceAttachmentToKyron).mockResolvedValue(
      "signed-attachment",
    );
    vi.mocked(createDraftWithRequiredPersistence).mockResolvedValue(kyronDraft);
    vi.mocked(completeWorkspaceSubmissionWithCalibration).mockResolvedValue(
      true,
    );
    vi.mocked(updateDraftWorkspaceKyronDestination).mockResolvedValue(
      workspace,
    );
  });

  it("keeps manual workspace submission working", async () => {
    await submitCurrentUserDraftWorkspace(workspace.id);

    expect(startDraftWorkspaceSubmission).toHaveBeenCalled();
    expect(createDraftWithRequiredPersistence).toHaveBeenCalled();
  });

  it("snapshots exactly the normalized setup sent to Kyron", async () => {
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
      false,
    );
  });

  it("records an optional calibration choice only with successful submission", async () => {
    await submitCurrentUserDraftWorkspace(workspace.id, true);

    expect(completeWorkspaceSubmissionWithCalibration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      kyronDraft.id,
      "Generating",
      generatedSetup,
      true,
    );
  });

  it("sends the workspace destination without adding it to the setup snapshot", async () => {
    const workspaceInFolder: DraftWorkspace = {
      ...workspace,
      kyronDestination: {
        folderId: 6121,
        path: [
          { id: 612, name: "EM 612" },
          { id: 6121, name: "Module 1" },
        ],
      },
    };
    vi.mocked(getDraftWorkspaceById).mockResolvedValue(workspaceInFolder);
    vi.mocked(startDraftWorkspaceSubmission).mockResolvedValue(
      workspaceInFolder,
    );

    await submitCurrentUserDraftWorkspace(workspace.id);

    expect(createDraftWithRequiredPersistence).toHaveBeenCalledWith({
      ...generatedSetup,
      alignmentContentSignedId: "signed-attachment",
      assetFolderId: 6121,
    });
    expect(completeWorkspaceSubmissionWithCalibration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      kyronDraft.id,
      "Generating",
      generatedSetup,
      false,
    );
  });

  it("updates an unsubmitted workspace destination independently", async () => {
    const destination = {
      folderId: 6121,
      path: [
        { id: 612, name: "EM 612" },
        { id: 6121, name: "Module 1" },
      ],
    };

    await updateCurrentUserWorkspaceKyronDestination(
      workspace.id,
      destination,
    );

    expect(updateDraftWorkspaceKyronDestination).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      destination,
    );
  });

  it("returns a clear recoverable state when the selected folder is unavailable", async () => {
    const workspaceInFolder: DraftWorkspace = {
      ...workspace,
      kyronDestination: {
        folderId: 6121,
        path: [{ id: 6121, name: "Module 1" }],
      },
    };
    vi.mocked(getDraftWorkspaceById).mockResolvedValue(workspaceInFolder);
    vi.mocked(startDraftWorkspaceSubmission).mockResolvedValue(
      workspaceInFolder,
    );
    vi.mocked(createDraftWithRequiredPersistence).mockRejectedValue(
      new KyronClientError({
        code: "KYRON_NOT_FOUND",
        message: "The requested Kyron resource was not found.",
        retryable: false,
        upstreamStatus: 404,
      }),
    );

    await expect(
      submitCurrentUserDraftWorkspace(workspace.id),
    ).rejects.toThrow(
      "The selected Kyron folder is no longer available. Choose another destination and try again.",
    );
    expect(failDraftWorkspaceSubmission).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      "The selected Kyron folder is no longer available. Choose another destination and try again.",
    );
  });
});
