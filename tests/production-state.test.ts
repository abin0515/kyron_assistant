import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/production/repository", () => ({}));
vi.mock("@/server/qa/repository", () => ({}));
vi.mock("@/server/drafts/workspaces/repository", () => ({}));
vi.mock("@/server/logging/writer", () => ({ logEvent: vi.fn() }));

import { productionStateFor } from "@/server/production/service";
import type { StoredQaRun } from "@/server/qa/types";
import type { DraftWorkspace } from "@/types/api";

const workspace = (kyronDraftId: number | null) => ({ id: "ws-1", name: "Course", kyronDraftId }) as DraftWorkspace;
const run = (overrides: Partial<StoredQaRun>) =>
  ({ stage: "passed", stageMessage: "Done.", pendingSteps: [], findings: [], humanChecks: [], media: null, ...overrides }) as StoredQaRun;
const base = { budgetUsd: 1, costUsd: 0.01, draftStatus: null, lessonRun: null, setupRun: null };

describe("production stage", () => {
  it("follows a course from setup to review", () => {
    expect(productionStateFor({ ...base, workspace: workspace(null) })).toMatchObject({
      stage: "setup",
      needs: ["Generate the course setup"],
    });
    expect(productionStateFor({ ...base, workspace: workspace(null), setupRun: run({}) })).toMatchObject({
      stage: "setup",
      needs: ["Create the Kyron draft"],
    });
    expect(productionStateFor({ ...base, workspace: workspace(14826), draftStatus: "started" }).stage).toBe("generating");
    expect(
      productionStateFor({
        ...base,
        workspace: workspace(14826),
        draftStatus: "done",
        lessonRun: run({ stage: "checking", stageMessage: "Running fidelity checks…", pendingSteps: [{ kind: "decide" }] }),
      }),
    ).toMatchObject({ stage: "lesson_qa", needs: [] });
    expect(
      productionStateFor({
        ...base,
        workspace: workspace(14826),
        draftStatus: "done",
        lessonRun: run({ stage: "video", pendingSteps: [{ kind: "video_poll", attempt: 3 }] }),
      }).stage,
    ).toBe("video");
    expect(
      productionStateFor({
        ...base,
        workspace: workspace(14826),
        draftStatus: "done",
        lessonRun: run({ humanChecks: [{ criterionId: "tutor", title: "Tutor", status: "pending", note: null, decidedBy: null, decidedAt: null }] }),
      }),
    ).toMatchObject({ stage: "review", needs: ["Render and check the video", "Complete 1 human check(s)"] });
    expect(
      productionStateFor({ ...base, workspace: workspace(14826), draftStatus: "done", lessonRun: run({ stage: "verified" }) }).stage,
    ).toBe("ready");
  });

  it("blocks a course that failed in Kyron or spent its budget", () => {
    expect(productionStateFor({ ...base, workspace: workspace(14826), draftStatus: "error" }).stage).toBe("blocked");
    expect(productionStateFor({ ...base, costUsd: 1.2, workspace: workspace(14826) })).toMatchObject({
      stage: "blocked",
      needs: ["Raise QA_COURSE_BUDGET_USD or stop this course"],
    });
  });
});
