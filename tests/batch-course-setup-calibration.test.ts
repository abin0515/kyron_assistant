import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/batches/repository", () => ({
  createBatchWithWorkspaces: vi.fn(),
  deleteBatch: vi.fn(),
  getBatchById: vi.fn(),
  listBatchesByUser: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup-calibrations/repository", () => ({
  claimBatchCourseSetupGeneration: vi.fn(),
  completeBatchCourseSetupGeneration: vi.fn(),
  ensureBatchCourseSetupCalibration: vi.fn(),
  failBatchCourseSetupGeneration: vi.fn(),
  markCourseSetupReviewed: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup/service", () => ({
  generateCourseSetupWithMetadata: vi.fn(),
}));
vi.mock("@/server/drafts/workspace-source-files/service", () => ({
  updateCurrentWorkspaceSourceFiles: vi.fn(),
}));
vi.mock("@/server/drafts/workspaces/repository", () => ({
  updateDraftWorkspace: vi.fn(),
}));
vi.mock("@/server/identity/current-user", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/server/source-files/repository", () => ({
  getSourceFilesByIds: vi.fn(),
}));

import { getBatchById } from "@/server/batches/repository";
import {
  claimBatchCourseSetupGeneration,
  completeBatchCourseSetupGeneration,
  ensureBatchCourseSetupCalibration,
  markCourseSetupReviewed,
} from "@/server/drafts/course-setup-calibrations/repository";
import { generateCourseSetupWithMetadata } from "@/server/drafts/course-setup/service";
import { updateCurrentWorkspaceSourceFiles } from "@/server/drafts/workspace-source-files/service";
import { updateDraftWorkspace } from "@/server/drafts/workspaces/repository";
import {
  generateCurrentUserBatchSetups,
  reviewCurrentUserBatchWorkspace,
} from "@/server/batches/service";
import { getCurrentUser } from "@/server/identity/current-user";
import type { CourseSetup, DraftBatch, DraftWorkspace } from "@/types/api";

const user = {
  id: "user_123",
  name: "Tasha Reviewer",
  email: "tasha@example.com",
};
const batchId = "f82d62c5-7818-4517-a960-09e28ecb0992";
const workspaceId = "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1";
const setup: CourseSetup = {
  name: "Project Planning",
  description: "Build a practical project plan.",
  learningObjective: "Create a project plan.",
  audience: "New project managers",
  assetType: "lesson",
  duration: 900,
};
const batch: DraftBatch = {
  id: batchId,
  name: "Planning batch",
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
  workspaces: [
    {
      id: workspaceId,
      sourceFile: {
        id: "87856825-acb9-41ca-a086-0038c612d1bc",
        name: "planning.pdf",
        size: 1200,
        type: "pdf",
      },
      status: "setup_pending",
      statusMessage: "Waiting to generate a course setup.",
      setup,
      attachToKyron: false,
      kyronDraftId: null,
      updatedAt: "2026-09-14T12:00:00.000Z",
    },
  ],
};
const workspace: DraftWorkspace = {
  ...setup,
  id: workspaceId,
  status: "editing",
  statusMessage: "",
  sourceText: "",
  kyronDraftId: null,
  submittedAt: null,
  courseSetupCalibration: null,
  createdBy: user,
  recordCreatedAt: "2026-09-14T12:00:00.000Z",
  recordUpdatedAt: "2026-09-14T12:00:00.000Z",
};
const generation = {
  setup,
  promptVersion: "course-setup-v1",
  model: "gpt-test",
};

describe("batch course setup calibration", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getBatchById).mockResolvedValue(batch);
    vi.mocked(claimBatchCourseSetupGeneration).mockResolvedValue(true);
    vi.mocked(generateCourseSetupWithMetadata).mockResolvedValue(generation);
    vi.mocked(completeBatchCourseSetupGeneration).mockResolvedValue(true);
    vi.mocked(ensureBatchCourseSetupCalibration).mockResolvedValue();
    vi.mocked(updateDraftWorkspace).mockResolvedValue(workspace);
    vi.mocked(updateCurrentWorkspaceSourceFiles).mockResolvedValue([]);
    vi.mocked(markCourseSetupReviewed).mockResolvedValue(true);
  });

  it("persists batch generation through the shared calibration lifecycle", async () => {
    await generateCurrentUserBatchSetups(batchId);

    expect(claimBatchCourseSetupGeneration).toHaveBeenCalledWith(
      batchId,
      workspaceId,
      user.id,
      expect.any(String),
    );
    expect(completeBatchCourseSetupGeneration).toHaveBeenCalledWith(
      batchId,
      workspaceId,
      user.id,
      expect.any(String),
      generation,
    );
  });

  it("uses the authenticated user when reviewing an edited batch setup", async () => {
    await reviewCurrentUserBatchWorkspace(
      batchId,
      workspaceId,
      { ...setup, name: "Updated project planning" },
      true,
    );

    expect(updateDraftWorkspace).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      { ...setup, name: "Updated project planning" },
    );
    expect(ensureBatchCourseSetupCalibration).toHaveBeenCalledWith(
      batchId,
      workspaceId,
      user.id,
    );
    expect(markCourseSetupReviewed).toHaveBeenCalledWith(workspaceId, user);
    expect(updateCurrentWorkspaceSourceFiles).toHaveBeenCalledWith(
      workspaceId,
      "kyron_attachment",
      [batch.workspaces[0].sourceFile?.id],
    );
  });
});
