import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from "@/server/db/client";
import {
  claimBatchCourseSetupGeneration,
  completeBatchCourseSetupGeneration,
  completeCourseSetupGeneration,
  markCourseSetupReviewed,
} from "@/server/drafts/course-setup-calibrations/repository";

describe("course setup calibration repository", () => {
  let query = "";
  let values: unknown[] = [];

  beforeEach(() => {
    query = "";
    values = [];

    const sql = (
      strings: TemplateStringsArray,
      ...parameters: unknown[]
    ) => {
      query = strings.join("?");
      values = parameters;
      return Promise.resolve([
        { workspace_id: "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1" },
      ]);
    };

    vi.mocked(getDatabase).mockReturnValue(
      sql as unknown as ReturnType<typeof getDatabase>,
    );
  });

  it("snapshots the persisted six fields and authenticated reviewer", async () => {
    const user = {
      id: "user_123",
      name: "Tasha Reviewer",
      email: "tasha@example.com",
    };

    await markCourseSetupReviewed(
      "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
      user,
    );

    for (const field of [
      "'name'",
      "'description'",
      "'learningObjective'",
      "'audience'",
      "'assetType'",
      "'duration'",
    ]) {
      expect(query).toContain(field);
    }

    expect(query).toContain("FROM draft_workspaces AS workspace");
    expect(query).toContain("calibration.generation_token IS NULL");
    expect(query).toContain("setup_status = 'reviewed'");
    expect(values).toEqual(
      expect.arrayContaining([
        user.id,
        user.name,
        user.email,
      ]),
    );
  });

  it("claims batch generation through the shared calibration row", async () => {
    await claimBatchCourseSetupGeneration(
      "f82d62c5-7818-4517-a960-09e28ecb0992",
      "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
      "user_123",
      "deaa8710-5507-4904-9940-532873b5e312",
    );

    expect(query).toContain("INSERT INTO course_setup_calibrations");
    expect(query).toContain("setup_status = 'generating'");
    expect(values).toEqual(
      expect.arrayContaining([
        "f82d62c5-7818-4517-a960-09e28ecb0992",
        "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
        "user_123",
        "deaa8710-5507-4904-9940-532873b5e312",
      ]),
    );
  });

  it("makes a single generated setup ready without a review gate", async () => {
    const result = {
      setup: {
        name: "Project Planning",
        description: "Build a practical project plan.",
        learningObjective: "Create a project plan.",
        audience: "New project managers",
        assetType: "lesson" as const,
        duration: 900 as const,
      },
      promptVersion: "course-setup-v1",
      model: "gpt-test",
    };

    await completeCourseSetupGeneration(
      "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
      "user_123",
      "deaa8710-5507-4904-9940-532873b5e312",
      result,
    );

    expect(query).toContain("review_required = FALSE");
    expect(query).toContain("include_in_calibration = FALSE");
  });

  it("stores the batch AI baseline and generation metadata", async () => {
    const result = {
      setup: {
        name: "Project Planning",
        description: "Build a practical project plan.",
        learningObjective: "Create a project plan.",
        audience: "New project managers",
        assetType: "lesson" as const,
        duration: 900 as const,
      },
      promptVersion: "course-setup-v1",
      model: "gpt-test",
    };

    await completeBatchCourseSetupGeneration(
      "f82d62c5-7818-4517-a960-09e28ecb0992",
      "04bb97aa-47ae-4a87-a1eb-53ac43c3fba1",
      "user_123",
      "deaa8710-5507-4904-9940-532873b5e312",
      result,
    );

    expect(query).toContain("generated_setup =");
    expect(query).toContain("prompt_version =");
    expect(query).toContain("review_status = 'needs_review'");
    expect(query).toContain("review_required = FALSE");
    expect(query).toContain("setup_status = 'reviewed'");
    expect(values).toEqual(
      expect.arrayContaining([
        JSON.stringify(result.setup),
        result.promptVersion,
        result.model,
      ]),
    );
  });
});
