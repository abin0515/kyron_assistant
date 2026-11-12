import { describe, expect, it } from "vitest";

import { keepGeneratedStatus } from "@/server/drafts/kyron-drafts/generated-status";
import type { Draft } from "@/types/api";

const draft = (status: Draft["status"], statusMessage = "") =>
  ({ id: 14826, name: "[QA Test] PDEs", status, statusMessage }) as Draft;

describe("a template QA already checked", () => {
  it("stays generated when a later video render turns Kyron's draft status to error or started", () => {
    expect(keepGeneratedStatus(draft("error", "Could not start avatar video generation for scene 611410"), true)).toMatchObject({
      status: "done",
      statusMessage: "Template generated. Kyron reports: Could not start avatar video generation for scene 611410",
    });
    expect(keepGeneratedStatus(draft("started"), true)).toMatchObject({ status: "done", statusMessage: "" });
  });

  it("keeps Kyron's status before QA has checked the template", () => {
    const failed = draft("error", "Generation failed");

    expect(keepGeneratedStatus(failed, false)).toBe(failed);
    expect(keepGeneratedStatus(draft("started"), false).status).toBe("started");
  });

  it("leaves a generated draft as it is", () => {
    const done = draft("done", "Lesson generated");

    expect(keepGeneratedStatus(done, true)).toBe(done);
  });
});
