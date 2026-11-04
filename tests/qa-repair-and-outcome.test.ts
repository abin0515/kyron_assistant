import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LessonContentSource } from "@/server/qa/content-sources";
import { applyPatch, decideRepair } from "@/server/qa/repair";
import { computeOutcome, createRunRecord, mergeEvaluation } from "@/server/qa/run-records";
import type { QaLesson, QaPatchProposal, QaRubricPack } from "@/types/api";

const proposal: QaPatchProposal = {
  activityId: "intro",
  fieldPath: "narration",
  currentValue: "Accuracy always improves.",
  proposedValue: "Accuracy does not always improve.",
  rationale: "Matches the reference.",
  protectedField: false,
};
const lesson: QaLesson = {
  id: "lesson-1",
  title: "Lesson",
  domain: "hs-ai",
  workspaceId: "ws-1",
  ownerId: "owner-1",
  kyronLessonId: 1,
  createdAt: "2026-10-30T00:00:00Z",
  createdBy: "t",
  latestSnapshotId: null,
  latestRunId: null,
};
const rubric = {
  domain: "hs-ai",
  name: "Test",
  version: "v1",
  audienceGuidance: "",
  approval: null,
  criteria: [
    { target: "lesson", id: "accuracy.claims-supported", title: "Claims", dimension: "accuracy", evaluator: "fidelity", requirement: "", releaseBlocker: "", required: true },
    { target: "lesson", id: "media.narration-match", title: "Video", dimension: "media", evaluator: "media", requirement: "", releaseBlocker: "", required: false },
    { target: "lesson", id: "tutor.runtime-behavior", title: "Tutor", dimension: "tutor", evaluator: "human", requirement: "", releaseBlocker: "", required: true },
  ],
} as QaRubricPack;

describe("repair policy", () => {
  const writable = { policy: "auto" as const, writable: true };

  it("applies every proposed fix automatically, answer keys and lesson settings included", () => {
    expect(decideRepair({ status: "open", proposedPatch: proposal }, writable)).toEqual({ action: "apply" });
    expect(decideRepair({ status: "open", proposedPatch: { ...proposal, protectedField: true } }, writable)).toEqual({
      action: "apply",
    });
  });

  it("holds fixes back only in propose-only mode", () => {
    expect(
      decideRepair({ status: "open", proposedPatch: proposal }, { policy: "propose_only", writable: true }).action,
    ).toBe("escalate");
    expect(
      decideRepair({ status: "accepted", proposedPatch: proposal }, { policy: "propose_only", writable: true }),
    ).toEqual({ action: "apply" });
  });

  it("only proposes when the lesson cannot be written", () => {
    expect(decideRepair({ status: "open", proposedPatch: proposal }, { policy: "auto", writable: false }).action).toBe("propose_only");
    expect(decideRepair({ status: "open", proposedPatch: null }, writable).action).toBe("escalate");
  });
});

describe("guarded patch application", () => {
  function sourceWith(initial: string, { dropWrites = false } = {}) {
    let value = initial;
    const writes: string[] = [];
    const source = {
      readField: async () => value,
      writeField: async (_lesson: QaLesson, _activity: string, _field: string, next: string) => {
        writes.push(next);
        value = dropWrites ? value : next;
      },
    } as unknown as LessonContentSource;

    return { source, writes };
  }

  it("writes and verifies the new value", async () => {
    const { source, writes } = sourceWith(proposal.currentValue);

    await expect(applyPatch(source, lesson, proposal)).resolves.toEqual({ status: "applied" });
    expect(writes).toEqual([proposal.proposedValue]);
  });

  it("refuses to overwrite a field someone else changed", async () => {
    const { source, writes } = sourceWith("Edited by a person meanwhile.");

    await expect(applyPatch(source, lesson, proposal)).resolves.toMatchObject({ status: "conflict" });
    expect(writes).toEqual([]);
  });

  it("reports when the read-back does not match", async () => {
    const { source } = sourceWith(proposal.currentValue, { dropWrites: true });

    await expect(applyPatch(source, lesson, proposal)).resolves.toMatchObject({ status: "verify_failed" });
  });
});

describe("run outcome", () => {
  const finding = {
    criterionId: "accuracy.claims-supported",
    evaluator: "fidelity" as const,
    activityId: "intro",
    fieldPath: "narration",
    severity: "major" as const,
    observedText: "Accuracy always improves.",
    expectedBehavior: "Agree with the reference.",
    rationale: "Contradicted.",
    evidence: [],
    retest: "Re-check.",
  };

  function baseRun() {
    return createRunRecord({ createdBy: "t", lesson, rubric, snapshotId: "s1", source: "manual", steps: [], target: "lesson" });
  }

  it("marks a finding fixed when the re-check no longer reports it", () => {
    const failing = mergeEvaluation(baseRun(), {
      evaluator: "fidelity",
      output: { checks: [{ criterionId: finding.criterionId, evaluator: "fidelity", activityId: "intro", status: "fail", summary: "" }], findings: [finding], usage: [] },
      scope: null,
      snapshotId: "s1",
    });
    const fixed = mergeEvaluation(failing, {
      evaluator: "fidelity",
      output: { checks: [{ criterionId: finding.criterionId, evaluator: "fidelity", activityId: "intro", status: "pass", summary: "" }], findings: [], usage: [] },
      scope: ["intro"],
      snapshotId: "s2",
    });

    expect(computeOutcome(failing, rubric).stage).toBe("changes_proposed");
    expect(fixed.findings[0].status).toBe("fixed");
    expect(fixed.checks).toHaveLength(1);
    expect(computeOutcome(fixed, rubric).stage).toBe("passed");
  });

  it("never passes a run whose required checks were not tested", () => {
    const run = mergeEvaluation(baseRun(), {
      evaluator: "fidelity",
      output: { checks: [{ criterionId: finding.criterionId, evaluator: "fidelity", activityId: "intro", status: "not_tested", summary: "No references." }], findings: [], usage: [] },
      scope: null,
      snapshotId: "s1",
    });

    expect(computeOutcome(run, rubric)).toMatchObject({ stage: "incomplete" });
    expect(computeOutcome(baseRun(), rubric).stage).toBe("incomplete");
  });

  it("verifies only after the video and human checks pass", () => {
    const passed = mergeEvaluation(
      mergeEvaluation(baseRun(), {
        evaluator: "fidelity",
        output: { checks: [{ criterionId: finding.criterionId, evaluator: "fidelity", activityId: "intro", status: "pass", summary: "" }], findings: [], usage: [] },
        scope: null,
        snapshotId: "s1",
      }),
      {
        evaluator: "media",
        output: { checks: [{ criterionId: "media.narration-match", evaluator: "media", activityId: null, status: "pass", summary: "" }], findings: [], usage: [] },
        scope: null,
        snapshotId: "s1",
      },
    );
    const withMedia = {
      ...passed,
      media: { fileName: "v.mp4", byteSize: 1, source: "upload" as const, status: "checked" as const, transcript: "", message: null },
    };

    expect(computeOutcome(withMedia, rubric).stage).toBe("passed");
    expect(
      computeOutcome(
        { ...withMedia, humanChecks: withMedia.humanChecks.map((check) => ({ ...check, status: "pass" as const })) },
        rubric,
      ).stage,
    ).toBe("verified");
  });
});
