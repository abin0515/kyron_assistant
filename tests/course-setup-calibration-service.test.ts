import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/drafts/course-setup-calibrations/repository", () => ({
  claimCourseSetupGeneration: vi.fn(),
  completeCourseSetupGeneration: vi.fn(),
  getCourseSetupCalibration: vi.fn(),
  markCourseSetupReviewed: vi.fn(),
  releaseCourseSetupGeneration: vi.fn(),
}));
vi.mock("@/server/drafts/course-setup/service", () => ({
  generateCourseSetupWithMetadata: vi.fn(),
}));
vi.mock("@/server/drafts/workspaces/repository", () => ({
  getDraftWorkspaceById: vi.fn(),
}));
vi.mock("@/server/identity/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

import {
  claimCourseSetupGeneration,
  completeCourseSetupGeneration,
  getCourseSetupCalibration,
  markCourseSetupReviewed,
  releaseCourseSetupGeneration,
} from "@/server/drafts/course-setup-calibrations/repository";
import {
  CourseSetupCalibrationConflictError,
  generateCurrentUserWorkspaceCourseSetup,
  reviewCurrentUserWorkspaceCourseSetup,
} from "@/server/drafts/course-setup-calibrations/service";
import { generateCourseSetupWithMetadata } from "@/server/drafts/course-setup/service";
import { getDraftWorkspaceById } from "@/server/drafts/workspaces/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import type { CourseSetup, DraftWorkspace } from "@/types/api";

const user = {
  id: "user_123",
  name: "Tasha Reviewer",
  email: "tasha@example.com",
  role: "user" as const,
};
const setup: CourseSetup = {
  name: "Project Planning",
  description: "Build a practical project plan.",
  learningObjective: "Create a project plan.",
  audience: "New project managers",
  assetType: "lesson",
  duration: 900,
};
const workspace: DraftWorkspace = {
  ...setup,
  id: "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
  status: "editing",
  statusMessage: "",
  sourceText: "Create a planning course.",
  kyronDraftId: null,
  submittedAt: null,
  kyronDestination: { folderId: null, path: [] },
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

describe("single-workspace course setup calibration service", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(claimCourseSetupGeneration).mockResolvedValue("claimed");
    vi.mocked(generateCourseSetupWithMetadata).mockResolvedValue(generation);
    vi.mocked(completeCourseSetupGeneration).mockResolvedValue(true);
    vi.mocked(getDraftWorkspaceById).mockResolvedValue(workspace);
    vi.mocked(getCourseSetupCalibration).mockResolvedValue(null);
    vi.mocked(releaseCourseSetupGeneration).mockResolvedValue();
    vi.mocked(markCourseSetupReviewed).mockResolvedValue(true);
  });

  it("persists only a successful generation as the active baseline", async () => {
    await generateCurrentUserWorkspaceCourseSetup({
      workspaceId: workspace.id,
    });

    expect(completeCourseSetupGeneration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      expect.any(String),
      generation,
    );
    expect(releaseCourseSetupGeneration).not.toHaveBeenCalled();
  });

  it("uses the same replacement path for regeneration", async () => {
    vi.mocked(getCourseSetupCalibration).mockResolvedValue({
      generatedSetup: { ...setup, name: "Old suggestion" },
      generatedAt: "2026-09-14T12:00:00.000Z",
      promptVersion: "course-setup-v1",
      model: "gpt-test",
      reviewRequired: true,
      reviewStatus: "needs_review",
      reviewResult: null,
      reviewedSetup: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedSetup: null,
      submittedAt: null,
      kyronDraftId: null,
      includeInCalibration: false,
      calibrationSelectedBy: null,
      calibrationSelectedAt: null,
    });

    const result = await generateCurrentUserWorkspaceCourseSetup({
      workspaceId: workspace.id,
    });

    expect(completeCourseSetupGeneration).toHaveBeenCalledTimes(1);
    expect(result.courseSetupCalibration?.generatedSetup.name).toBe(
      "Old suggestion",
    );
  });

  it("preserves the previous cycle when generation fails", async () => {
    vi.mocked(generateCourseSetupWithMetadata).mockRejectedValue(
      new Error("Provider unavailable"),
    );

    await expect(
      generateCurrentUserWorkspaceCourseSetup({
        workspaceId: workspace.id,
      }),
    ).rejects.toThrow("Provider unavailable");
    expect(completeCourseSetupGeneration).not.toHaveBeenCalled();
    expect(releaseCourseSetupGeneration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      expect.any(String),
    );
  });

  it("starts the same replacement cycle after an earlier review", async () => {
    await generateCurrentUserWorkspaceCourseSetup({
      workspaceId: workspace.id,
    });

    expect(completeCourseSetupGeneration).toHaveBeenCalledWith(
      workspace.id,
      user.id,
      expect.any(String),
      generation,
    );
  });

  it("rejects regeneration when the persisted workspace is locked", async () => {
    vi.mocked(claimCourseSetupGeneration).mockResolvedValue("locked");

    await expect(
      generateCurrentUserWorkspaceCourseSetup({
        workspaceId: workspace.id,
      }),
    ).rejects.toBeInstanceOf(CourseSetupCalibrationConflictError);
    expect(generateCourseSetupWithMetadata).not.toHaveBeenCalled();
  });

  it("uses the authenticated server user as the reviewer", async () => {
    await reviewCurrentUserWorkspaceCourseSetup(workspace.id);

    expect(markCourseSetupReviewed).toHaveBeenCalledWith(workspace.id, user);
  });
});
