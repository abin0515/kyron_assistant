import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from "@/server/db/client";
import { markCourseSetupReviewed } from "@/server/drafts/course-setup-calibrations/repository";

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
    expect(values).toEqual(
      expect.arrayContaining([
        user.id,
        user.name,
        user.email,
      ]),
    );
  });
});
