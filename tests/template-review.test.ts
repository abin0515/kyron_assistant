import { describe, expect, it } from "vitest";

import { buildModuleReport, mergeSharedFixes, type ReportFix } from "@/features/template-review/report";
import { courseSteps } from "@/features/template-review/steps";
import type { DraftWorkspace, QaFinding, QaRun, QaRunDetailResponse } from "@/types/api";

function finding(overrides: Partial<QaFinding> & Pick<QaFinding, "id" | "criterionId" | "status">): QaFinding {
  return {
    snapshotId: "snap",
    evaluator: "fidelity",
    activityId: "504103",
    fieldPath: "scenes.610130.narration",
    severity: "critical",
    observedText: null,
    expectedBehavior: "",
    rationale: "The notes count differentiations.",
    evidence: [],
    retest: "",
    proposedPatch: null,
    proposalAttempted: true,
    repairAttempts: 1,
    escalationReason: null,
    decision: null,
    createdAt: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

function detail(): QaRunDetailResponse {
  const run = {
    id: "run-1",
    target: "lesson",
    stage: "awaiting_approval",
    stageMessage: "",
    findings: [
      finding({ id: "f-fixed", criterionId: "accuracy.claims-supported", status: "fixed" }),
      finding({ id: "f-resolved", criterionId: "structure.no-placeholders", status: "fixed", repairAttempts: 0, activityId: "504101" }),
      finding({ id: "f-open", criterionId: "assessment.key-correct", status: "open", severity: "major", activityId: "504108", proposedPatch: { activityId: "504108", fieldPath: "question.answerKey", currentValue: "b", proposedValue: "a", rationale: "", protectedField: true } }),
      finding({ id: "f-esc", criterionId: "consistency.cross-field", status: "escalated", escalationReason: "Still failing after 2 automatic fixes." }),
      finding({ id: "f-len", criterionId: "length.practice-fit", status: "open", severity: "minor", evaluator: "length", activityId: "504108", fieldPath: null, rationale: "Practice is about 1 min; the Normal target is 10 min." }),
      finding({ id: "f-minor", criterionId: "pedagogy.audience-fit", status: "open", severity: "minor", evaluator: "alignment", activityId: null }),
    ],
    checks: [
      { id: "c-1", criterionId: "alignment.objective-coverage", evaluator: "alignment", activityId: null, status: "needs_review", summary: "Practice does not test linearity.", snapshotId: "snap", checkedAt: "" },
      { id: "c-2", criterionId: "length.video-fit", evaluator: "length", activityId: "504101", status: "needs_review", summary: "", snapshotId: "snap", checkedAt: "" },
    ],
    humanChecks: [{ criterionId: "tutor.runtime-behavior", title: "Tutor behaves well", status: "pending", note: null, decidedBy: null, decidedAt: null }],
    renderApproval: { status: "pending", requestedAt: "", snapshotId: "snap", decidedBy: null, decidedAt: null, rendersAllowed: 2 },
    lengths: {
      level: "normal",
      assets: [],
      topicVideos: [{ sectionId: "64011", topic: "PDE Order and Linearity", minutes: 4.9, category: "normal" }],
    },
    media: null,
  } as unknown as QaRun;

  return {
    run,
    lesson: {} as QaRunDetailResponse["lesson"],
    snapshot: {
      lesson: {
        title: "PDEs",
        description: null,
        audience: null,
        learningObjectives: ["Classify PDEs."],
        durationSeconds: 1800,
        assetType: null,
        sections: [{ id: "64011", topic: "PDE Order and Linearity", objectives: ["Classify PDEs by order and linearity."] }],
      },
      activities: [
        { id: "504101", title: "Introduction", type: "instruction", kyronType: "introduction", sectionId: "64011" },
        { id: "504103", title: "Read PDE Notation", type: "instruction", kyronType: "lecture", sectionId: "64011" },
        { id: "504108", title: "Which is linear?", type: "question", kyronType: "multiple_choice_learning", sectionId: "64011" },
        { id: "vocabulary", title: "Vocabulary", type: "other" },
      ],
    } as unknown as QaRunDetailResponse["snapshot"],
    contentWritable: true,
    pendingStepCount: 0,
    nextStepInMs: null,
    mediaUploadAvailable: true,
    criteria: [
      { id: "accuracy.claims-supported", title: "Claims match the references" },
      { id: "consistency.cross-field", title: "Fields agree with each other" },
      { id: "length.practice-fit", title: "Practice fits the length" },
      { id: "assessment.key-correct", title: "Answer keys are correct" },
      { id: "structure.no-placeholders", title: "No placeholder text" },
      { id: "alignment.objective-coverage", title: "Objectives are covered" },
      { id: "tutor.runtime-behavior", title: "Tutor behaves well", requirement: "The tutor answers within scope." },
    ] as QaRunDetailResponse["criteria"],
    versions: [
      {
        runId: "run-1",
        status: "applied",
        author: "QA revision agent",
        changes: [{ activityId: "504103", fieldPath: "scenes.610130.narration", before: "first-order", after: "second-order", rationale: "", findingIds: ["f-fixed"], criterionIds: [] }],
      },
      {
        runId: "run-1",
        status: "applied",
        author: "QA revision agent",
        changes: [{ activityId: "504101", fieldPath: "narration", before: "old", after: "rejected", rationale: "", findingIds: ["f-fixed"], criterionIds: [] }],
      },
      {
        runId: "run-1",
        status: "applied",
        author: "QA verifier",
        changes: [{ activityId: "504101", fieldPath: "narration", before: "rejected", after: "old", rationale: "", findingIds: ["f-fixed"], criterionIds: [] }],
      },
      {
        runId: "older-run",
        status: "applied",
        author: "QA revision agent",
        changes: [{ activityId: "504103", fieldPath: "narration", before: "x", after: "y", rationale: "", findingIds: ["f-fixed"], criterionIds: [] }],
      },
    ] as unknown as QaRunDetailResponse["versions"],
  };
}

describe("module report", () => {
  const report = buildModuleReport(detail());

  it("lists each asset under its topic and objectives, with the topic video's length and category", () => {
    expect(report.topics).toHaveLength(1);
    expect(report.topics[0]).toMatchObject({
      topic: "PDE Order and Linearity",
      objectives: ["Classify PDEs by order and linearity."],
      video: { minutes: 4.9, category: "normal" },
    });
    expect(report.topics[0].assets.map((asset) => [asset.title, asset.kindLabel, asset.anchor])).toEqual([
      ["Introduction", "Video", "asset-504101"],
      ["Read PDE Notation", "Video", "asset-504103"],
      ["Which is linear?", "Practice / quiz", "asset-504108"],
    ]);
  });

  it("shows what QA fixed with this run's before and after, without changes the verifier undid", () => {
    expect(report.resolved.map((item) => item.id)).toEqual(["f-resolved"]);
    expect(report.fixed).toEqual([
      expect.objectContaining({
        titles: ["Claims match the references"],
        where: "Read PDE Notation",
        changes: [expect.objectContaining({ before: "first-order", after: "second-order" })],
      }),
    ]);
    expect(report.noted.map((note) => note.id)).toEqual(["f-minor"]);
  });

  it("shows a fix once when several checks found it", () => {
    const base = detail();
    const shared = {
      activityId: "504101",
      fieldPath: "scenes.611410.narration",
      before: "abcdef",
      after: "A partial differential equation relates partial derivatives.",
      rationale: "",
      findingIds: ["f-nonsense", "f-audience"],
      criterionIds: [],
    };
    const merged = buildModuleReport({
      ...base,
      run: {
        ...base.run,
        findings: [
          finding({ id: "f-nonsense", criterionId: "structure.no-placeholders", evaluator: "structural", status: "fixed", activityId: "504101", rationale: '"abcdef" is not real text; learners would hear it.' }),
          finding({ id: "f-audience", criterionId: "pedagogy.audience-fit", evaluator: "alignment", status: "fixed", activityId: "504101", fieldPath: "narration", rationale: "This is random text unrelated to the lesson." }),
        ],
      },
      criteria: [...base.criteria, { id: "pedagogy.audience-fit", title: "Fits the audience" }] as QaRunDetailResponse["criteria"],
      versions: [{ runId: "run-1", status: "applied", author: "QA revision agent", changes: [shared] }] as unknown as QaRunDetailResponse["versions"],
    });

    expect(merged.fixed).toEqual([
      {
        id: "f-nonsense",
        findingIds: ["f-nonsense", "f-audience"],
        titles: ["No placeholder text", "Fits the audience"],
        where: "Introduction",
        reasons: ['"abcdef" is not real text; learners would hear it.', "This is random text unrelated to the lesson."],
        changes: [shared],
      },
    ]);
  });

  it("chains fixes through shared changes and keeps the first finding's order", () => {
    const change = (id: string) => ({ activityId: "a", fieldPath: id, before: "", after: id, rationale: "", findingIds: [], criterionIds: [] });
    const [c1, c2, c3] = [change("c1"), change("c2"), change("c3")];
    const fix = (id: string, changes: ReturnType<typeof change>[], title = id): ReportFix => ({
      id,
      findingIds: [id],
      titles: [title],
      where: "Introduction",
      reasons: [`reason ${id}`],
      changes,
    });

    const result = mergeSharedFixes(
      [fix("A", [c1]), fix("D", []), fix("B", [c1, c2], "A"), fix("E", [c3]), fix("C", [c2])],
      [c1, c2, c3],
    );

    expect(result.map((item) => [item.id, item.findingIds, item.titles, item.changes.map((entry) => entry.fieldPath)])).toEqual([
      ["A", ["A", "B", "C"], ["A", "C"], ["c1", "c2"]],
      ["D", ["D"], ["D"], []],
      ["E", ["E"], ["E"], ["c3"]],
    ]);
  });

  it("flags escalations, length misfits, checks needing review and human checks, each with a reason", () => {
    expect(report.flagged.map((flag) => [flag.title, flag.reason])).toEqual([
      ["Fields agree with each other", "Still failing after 2 automatic fixes."],
      ["Answer keys are correct", 'The notes count differentiations. QA could not apply a fix to this draft; proposed: "a".'],
      ["Practice fits the length", "Practice is about 1 min; the Normal target is 10 min."],
      ["Objectives are covered", "Needs a person's review: Practice does not test linearity."],
      ["Tutor behaves well", "Only a person can check this: The tutor answers within scope."],
    ]);
  });
});

describe("course steps", () => {
  const workspace = { id: "ws-1", sourceText: "Teach PDEs", courseSetupCalibration: null, kyronDraftId: 14826 } as Pick<
    DraftWorkspace,
    "id" | "sourceText" | "courseSetupCalibration" | "kyronDraftId"
  >;
  const states = (input: Parameters<typeof courseSteps>[0]) => courseSteps(input).map((step) => step.state);

  it("walks upload → plan → template → review → video", () => {
    expect(states({ draftStatus: null, lessonRun: null, workspace: { ...workspace, sourceText: "", kyronDraftId: null } })).toEqual([
      "current", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
    expect(states({ draftStatus: "started", lessonRun: null, workspace })).toEqual([
      "done", "done", "current", "upcoming", "upcoming",
    ]);
    expect(states({ draftStatus: "done", lessonRun: { stage: "awaiting_approval", renderApproval: null, media: null }, workspace })).toEqual([
      "done", "done", "done", "current", "upcoming",
    ]);
  });

  it("shows rendering as needing attention when it is turned off after approval", () => {
    const steps = courseSteps({
      draftStatus: "done",
      lessonRun: {
        stage: "passed",
        media: null,
        renderApproval: { status: "approved", requestedAt: "", snapshotId: "s", decidedBy: "CPE Admin", decidedAt: "", rendersAllowed: 2, renderingOff: true },
      },
      workspace,
    });

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "done", "attention"]);
    expect(steps[4].detail).toBe("Rendering is turned off");
  });

  it("shows a failed render as needing attention, not as rendered", () => {
    const steps = courseSteps({
      draftStatus: "done",
      lessonRun: {
        stage: "incomplete",
        media: { fileName: "Kyron render", byteSize: 0, source: "kyron_mcp", status: "failed", transcript: null, message: "x" },
        renderApproval: { status: "approved", requestedAt: "", snapshotId: "s", decidedBy: "CPE Admin", decidedAt: "", rendersAllowed: 2, renderingOff: false },
      },
      workspace,
    });

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "done", "attention"]);
    expect(steps[4].detail).toBe("The render did not finish");
  });
});
