import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { RenderNotSentError } from "@/server/qa/content-errors";
import type { LessonContentSource, VideoJobStatus, VideoPollState } from "@/server/qa/content-sources";
import type { EvaluationInput, EvaluationOutput } from "@/server/qa/evaluators/types";
import type { LessonPacket } from "@/server/qa/types";
import type { Revision } from "@/server/qa/revision-agent";
import type { DraftWorkspace, QaFinding, QaLesson, QaLessonSnapshot } from "@/types/api";

const mocks = vi.hoisted(() => ({
  setupSource: null as unknown,
  kyronSource: null as unknown,
  budgetProblem: null as string | null,
  // Thrown once by the next budget read.
  budgetError: null as Error | null,
  verdict: "resolves" as string,
  // One verdict per verifier call, in order; then `verdict`.
  verdicts: [] as string[],
  transcripts: [] as string[],
  // Render status results (or errors to throw), in order.
  videoStatuses: [] as Array<VideoJobStatus | Error>,
  // Run the real structural rules instead of a passing stub.
  realStructural: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/logging/writer", () => ({ logEvent: vi.fn(), recordLlmUsage: vi.fn() }));
vi.mock("@/server/qa/repository", async () =>
  (await import("./helpers/in-memory-qa-repository")).createInMemoryQaRepository(),
);
vi.mock("@/server/drafts/workspaces/repository", () => ({
  getDraftWorkspaceById: vi.fn(),
  findWorkspaceOwnerByKyronDraftId: vi.fn(),
  updateDraftWorkspace: vi.fn(),
}));
vi.mock("@/server/qa/workspace-references", () => ({ loadWorkspaceReferences: vi.fn(async () => []) }));
vi.mock("@/server/kyron-mcp/service", async () => {
  const { KyronMcpError } = await import("@/server/kyron-mcp/errors");
  const notConnected = async () => {
    throw new KyronMcpError("KYRON_MCP_NOT_CONNECTED", "Kyron is not connected. Use Connect Kyron first.");
  };

  return { withKyronReader: notConnected, withKyronWriter: notConnected, hasKyronWriteAccess: async () => false };
});
vi.mock("@/server/production/service", () => ({
  courseBudgetProblem: async () => {
    const error = mocks.budgetError;

    if (error) {
      // Fails once, then reads normally.
      mocks.budgetError = null;
      throw error;
    }

    return mocks.budgetProblem;
  },
  ensureProductionJob: async () => undefined,
}));
vi.mock("@/server/qa/defects", () => ({ recordDefect: vi.fn() }));
vi.mock("@/server/qa/verifier", () => ({
  VERIFIER_NAME: "QA verifier",
  verifyChanges: async ({ changes }: { changes: unknown[] }) => {
    const verdict = mocks.verdicts.shift() ?? mocks.verdict;

    return {
      verdicts: changes.map((_, index) => ({ index, verdict, explanation: "Checked against the reference." })),
      usage: { purpose: "qa.verify", inputTokens: 30, outputTokens: 10, reasoningTokens: 5 },
    };
  },
}));
vi.mock("@/server/qa/evaluators/media", () => ({
  evaluateNarrationMatch: async (_snapshot: unknown, transcript: string) => {
    const wrong = transcript.includes("MISMATCH");

    return {
      checks: [{ criterionId: "media.narration-match", evaluator: "media", activityId: null, status: wrong ? "fail" : "pass", summary: "" }],
      findings: wrong
        ? [{
            criterionId: "media.narration-match",
            evaluator: "media",
            activityId: null,
            fieldPath: null,
            severity: "major",
            observedText: transcript,
            expectedBehavior: "The video says the script.",
            rationale: "The narration differs.",
            evidence: [],
            retest: "Render again.",
          }]
        : [],
      usage: [],
    };
  },
}));

vi.mock("@/server/qa/content-sources", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/qa/content-sources")>();

  return {
    ...original,
    resolveContentSource: async (kind: "manual" | "kyron_mcp" | "workspace_setup", lesson: QaLesson) => {
      if (kind === "workspace_setup") {
        return mocks.setupSource;
      }

      return kind === "kyron_mcp" && mocks.kyronSource ? mocks.kyronSource : original.resolveContentSource(kind, lesson);
    },
  };
});

vi.mock("@/server/qa/evaluators", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/qa/evaluators")>();

  return {
    ...original,
    SCRIPT_EVALUATORS: {
      course_setup: fakeCourseSetup,
      structural: (input: EvaluationInput) =>
        mocks.realStructural
          ? original.SCRIPT_EVALUATORS.structural(input)
          : passing("structural", ["structure.required-fields", "structure.no-placeholders", "structure.question-integrity"])(input),
      length: original.SCRIPT_EVALUATORS.length,
      assessment: passing("assessment", ["assessment.key-correct", "assessment.single-best-answer"]),
      fidelity: fakeFidelity,
      consistency: passing("consistency", ["consistency.cross-field"]),
      alignment: passing("alignment", ["alignment.objective-coverage", "pedagogy.audience-fit"]),
    },
  };
});

vi.mock("@/server/qa/revision-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/qa/revision-agent")>();

  return {
    ...original,
    reviseContent: async ({ findings, snapshot }: { findings: QaFinding[]; snapshot: QaLessonSnapshot }) => ({
      revisions: findings.flatMap((finding) => fakeRevision(finding, snapshot) ?? []),
      unresolved: [],
      usage: { purpose: "qa.revision", inputTokens: 40, outputTokens: 20, reasoningTokens: 5 },
      model: "gpt-6-luna",
    }),
  };
});

import { buildSetupPacket } from "@/server/qa/course-setup-fields";
import { driveQaRunsUntil, processNextStep, startQaRun } from "@/server/qa/pipeline";
import * as repository from "@/server/qa/repository";
import {
  approveRender,
  assertSetupReadyForSubmission,
  getRunDetail,
  QaConflictError,
  QaSubmissionGateError,
} from "@/server/qa/service";
import { buildSnapshot, readActivityField, writeActivityField } from "@/server/qa/snapshot";

const store = repository as unknown as { reset(): void };
const user = { id: "owner-1", name: "Tester", email: "t@example.com", role: "admin" as const };
const lessonPacket: LessonPacket = {
  lesson: {
    title: "Overfitting",
    description: null,
    audience: "Students",
    learningObjectives: ["Explain overfitting."],
    durationSeconds: 480,
    assetType: "lesson",
  },
  activities: [
    {
      id: "intro",
      title: null,
      type: "instruction",
      narration: "Increasing training accuracy always improves performance on unseen data.",
      onScreenText: null,
      question: null,
      tutorGuidance: null,
      media: [],
    },
  ],
  references: [{ title: "Ref", text: "Training accuracy does not always improve unseen performance." }],
};

beforeEach(() => {
  store.reset();
  delete process.env.QA_RUN_TOKEN_BUDGET;
  process.env.QA_AUDIT_RATE = "0";
  process.env.QA_VIDEO_POLL_MS = "0";
  process.env.QA_STEP_RETRY_MS = "0";
  mocks.kyronSource = null;
  mocks.budgetProblem = null;
  mocks.budgetError = null;
  mocks.verdict = "resolves";
  mocks.verdicts = [];
  mocks.transcripts = [];
  mocks.videoStatuses = [];
  mocks.realStructural = false;
});

afterEach(() => {
  delete process.env.QA_AUDIT_RATE;
});

describe("course-setup QA inside generation", () => {
  it("applies a safe fix to the workspace and verifies it", async () => {
    const setup = fakeSetupSource({ learningObjective: "Understand overfitting." });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "workspace_setup",
      target: "course_setup",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("passed");
    expect(firstFinding(finished)).toMatchObject({ status: "fixed", repairAttempts: 1 });
    expect(setup.current().learningObjective).toBe(
      "Explain how training and test accuracy reveal overfitting.",
    );
    expect(finished.humanChecks).toEqual([]);
    expect(finished.usageByPurpose["qa.revision"]).toMatchObject({ calls: 1 });

    const [revised, read] = await versionsOf(finished.lessonId);

    expect(read).toMatchObject({ versionNumber: 1, status: "applied", author: "Workspace course setup", changes: [] });
    expect(revised).toMatchObject({
      versionNumber: 2,
      status: "applied",
      author: "QA revision agent",
      model: "gpt-6-luna",
      parentVersionId: read.id,
      changes: [
        {
          fieldPath: "setup.learningObjective",
          before: "Understand overfitting.",
          after: "Explain how training and test accuracy reveal overfitting.",
          criterionIds: ["setup.objective-measurable"],
        },
      ],
    });
  });

  it("records a change made in the workspace as a new version", async () => {
    const setup = fakeSetupSource({ learningObjective: "Explain overfitting." });
    const lesson = await saveLesson("ws-1");
    const start = () =>
      startQaRun({ createdBy: "Tester", lesson, snapshot: null, source: "workspace_setup", target: "course_setup" });

    await runToCompletion((await start()).id);
    setup.edit({ audience: "Data science bootcamp students" });
    await runToCompletion((await start()).id);

    const versions = await versionsOf(lesson.id);

    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      versionNumber: 2,
      author: "Edited in the workspace",
      changes: [{ fieldPath: "setup.audience", before: "High-school students", after: "Data science bootcamp students" }],
    });
  });

  it("fixes a critical setup problem automatically, without waiting for a person", async () => {
    const setup = fakeSetupSource({ learningObjective: "Understand overfitting.", description: "OFF-TOPIC" });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "workspace_setup",
      target: "course_setup",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("passed");
    expect(finished.findings.find((finding) => finding.severity === "critical")).toMatchObject({
      status: "fixed",
      escalationReason: null,
    });
    expect(setup.current().description).toBe("How training and test accuracy diverge.");

    const versions = await versionsOf(finished.lessonId);

    expect(versions.some((version) => version.status === "proposed")).toBe(false);
    expect(versions[0]).toMatchObject({ status: "applied", author: "QA revision agent" });
    expect(versions[0].changes.map((change) => change.fieldPath).sort()).toEqual([
      "setup.description",
      "setup.learningObjective",
    ]);
  });

  it("gates Kyron submission on a current, passing setup check", async () => {
    // A blocking problem the revision agent cannot fix still stops submission.
    fakeSetupSource({ learningObjective: "Explain overfitting.", description: "UNFIXABLE" });
    const workspace = fakeWorkspace("ws-2");

    await expect(assertSetupReadyForSubmission({ override: false, user, workspace })).rejects.toBeInstanceOf(
      QaSubmissionGateError,
    );
    await expect(assertSetupReadyForSubmission({ override: true, user, workspace })).resolves.toBeUndefined();

    fakeSetupSource({ learningObjective: "Explain overfitting." });

    await expect(
      assertSetupReadyForSubmission({ override: false, user, workspace: fakeWorkspace("ws-3") }),
    ).resolves.toBeUndefined();
  });

  it("asks to submit again when the check used most of the request, before logging an override", async () => {
    const late = Date.now() - 151_000;

    fakeSetupSource({ learningObjective: "Explain overfitting." });
    await expect(
      assertSetupReadyForSubmission({ override: false, startedAt: late, user, workspace: fakeWorkspace("ws-4") }),
    ).rejects.toMatchObject({ reason: "checking", message: expect.stringContaining("Submit again") });

    fakeSetupSource({ learningObjective: "Explain overfitting.", description: "UNFIXABLE" });
    const workspace = fakeWorkspace("ws-5");

    await expect(
      assertSetupReadyForSubmission({ override: true, startedAt: late, user, workspace }),
    ).rejects.toMatchObject({ reason: "checking" });

    const run = await repository.getLatestWorkspaceRun("ws-5", "course_setup");

    expect(run?.events.some((event) => event.message.includes("unresolved quality findings"))).toBe(false);
    // The retry passes the settled check at once.
    await expect(assertSetupReadyForSubmission({ override: true, user, workspace })).resolves.toBeUndefined();
  });
});

describe("generated-lesson QA", () => {
  it("waits for Kyron MCP lesson access instead of failing", async () => {
    const run = await startQaRun({
      createdBy: "Course launcher",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("blocked");
    expect(finished.stageMessage).toContain("Kyron is not connected");
  });

  it("proposes fixes for pasted lesson content without changing it", async () => {
    const lesson = await saveLesson("ws-1");
    const snapshot = await repository.saveSnapshot(
      buildSnapshot({ createdBy: "Tester", lessonId: lesson.id, packet: lessonPacket, source: "manual" }),
    );
    const run = await startQaRun({ createdBy: "Tester", lesson, snapshot, source: "manual", target: "lesson" });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("changes_proposed");
    expect(firstFinding(finished)).toMatchObject({
      status: "open",
      proposalAttempted: true,
      proposedPatch: { proposedValue: expect.stringContaining("does not always improve") },
    });
    expect(finished.humanChecks.map((check) => check.criterionId)).toEqual([
      "media.visuals",
      "tutor.runtime-behavior",
    ]);

    const [proposed, pasted] = await versionsOf(lesson.id);
    const detail = await repository.getContentVersion(proposed.id);

    expect(pasted).toMatchObject({ status: "applied", author: "Pasted by Tester" });
    expect(proposed).toMatchObject({ status: "proposed", parentVersionId: pasted.id });
    expect(detail?.content.activities[0].narration).toContain("does not always improve");
    expect((await repository.getSnapshot(snapshot.id))?.activities[0].narration).toContain("always improves");
  });

  it("applies, re-reads and re-checks a fix when the lesson is writable", async () => {
    const kyron = fakeKyronSource(lessonPacket);
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("awaiting_approval");
    expect(finished.renderApproval).toMatchObject({ status: "pending", snapshotId: finished.snapshotId });
    expect(firstFinding(finished)).toMatchObject({ status: "fixed", repairAttempts: 1 });
    expect(kyron.narration()).toContain("does not always improve");

    const [revised, generated] = await versionsOf(finished.lessonId);

    expect(generated).toMatchObject({ author: "Kyron generation", status: "applied" });
    expect(revised).toMatchObject({
      author: "QA revision agent",
      changes: [{ activityId: "intro", fieldPath: "narration", after: expect.stringContaining("does not always improve") }],
    });
  });

  it("escalates instead of overwriting a concurrent edit", async () => {
    const kyron = fakeKyronSource(lessonPacket);
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    // Read the lesson and run the checks, then simulate a person editing it.
    for (let step = 0; step < 7; step += 1) {
      await processNextStep(run.id);
    }

    kyron.setNarration("A person rewrote this: training accuracy always improves results.");

    const finished = await runToCompletion(run.id);

    // The person reviewing the template sees the escalation in the report.
    expect(finished.stage).toBe("awaiting_approval");
    expect(finished.stageMessage).toContain("flagged for human review");
    expect(firstFinding(finished)).toMatchObject({ status: "escalated" });
    expect(firstFinding(finished).escalationReason).toContain("changed since it was checked");
    expect((await versionsOf(finished.lessonId)).map((version) => version.author)).toEqual(["Kyron generation"]);
  });

  it("fixes the scene that says the wrong thing, verifies it and records the scene change", async () => {
    const kyron = fakeKyronSource(scenePacket());
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);
    const [revised] = await versionsOf(finished.lessonId);

    expect(finished.stage).toBe("awaiting_approval");
    expect(kyron.scene("s2")).toContain("does not always improve");
    expect(kyron.scene("s1")).toBe("Overfitting means memorizing noise.");
    expect(revised.changes).toMatchObject([{ activityId: "intro", fieldPath: "scenes.s2.narration" }]);
    expect(finished.events.some((event) => event.message.startsWith("QA verifier: 1 resolves"))).toBe(true);
    expect(finished.usageByPurpose["qa.verify"]).toMatchObject({ calls: 1 });
  });

  it("rewrites nonsense narration instead of only noting it", async () => {
    mocks.realStructural = true;

    const packet = scenePacket();
    const activity = packet.activities[0];
    const scenes = (activity.scenes ?? []).map((scene) => (scene.id === "s1" ? { ...scene, narration: "abcdef" } : scene));
    const kyron = fakeKyronSource({
      ...packet,
      activities: [{ ...activity, scenes, narration: scenes.map((scene) => scene.narration).join("\n\n") }],
    });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.findings.find((finding) => finding.criterionId === "structure.no-placeholders")).toMatchObject({
      severity: "major",
      status: "fixed",
      activityId: "intro",
      fieldPath: "scenes.s1.narration",
    });
    expect(kyron.scene("s1")).toBe("Overfitting is when a model memorizes noise in its training data.");
    expect(finished.stage).toBe("awaiting_approval");
  });

  it("undoes a fix the independent check rejects, tries again, and escalates after two attempts", async () => {
    mocks.verdict = "introduces_error";

    const kyron = fakeKyronSource(lessonPacket);
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);
    const versions = await versionsOf(finished.lessonId);

    expect(kyron.narration()).toContain("always improves");
    expect(kyron.narration()).not.toContain("does not always improve");
    expect(finished.usageByPurpose["qa.revision"]).toMatchObject({ calls: 2 });
    expect(versions.filter((version) => version.author === "QA verifier")).toHaveLength(2);
    expect(firstFinding(finished)).toMatchObject({ status: "escalated", repairAttempts: 2 });
    expect(firstFinding(finished).escalationReason).toContain("Still failing after 2 automatic fixes");
    expect(firstFinding(finished).escalationReason).toContain("independent check rejected the last fix");
  });

  it("fixes a rejected change on the second attempt", async () => {
    mocks.verdicts = ["introduces_error", "resolves"];

    const kyron = fakeKyronSource(lessonPacket);
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("awaiting_approval");
    expect(kyron.narration()).toContain("does not always improve");
    expect(firstFinding(finished)).toMatchObject({ status: "fixed", repairAttempts: 2, escalationReason: null });
  });

  it("waits for approval, then renders and re-renders once when the narration differs", async () => {
    mocks.transcripts = ["MISMATCH: the avatar skipped a sentence", "Training accuracy does not always improve unseen performance."];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const reviewed = await runToCompletion(run.id);

    // The script passed, but nothing is rendered until a person approves.
    expect(reviewed.stage).toBe("awaiting_approval");
    expect(kyron.renders()).toBe(0);

    const approved = await approveRender(run.id, user);

    expect(approved.run).toMatchObject({ stage: "video", renderApproval: { status: "approved", decidedBy: "Tester" } });

    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(2);
    expect(finished.videoRequests).toBe(2);
    expect(finished.media).toMatchObject({ status: "checked", source: "kyron_mcp" });
    expect(finished.findings.find((finding) => finding.evaluator === "media")).toMatchObject({ status: "fixed" });
    expect(finished.stage).toBe("passed");
  });

  it("records the approval and renders nothing while video rendering is off", async () => {
    const kyron = fakeKyronSource(fixedPacket());
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);

    const approved = await approveRender(run.id, user);
    const finished = await runToCompletion(run.id);

    expect(approved.run.renderApproval).toMatchObject({ status: "approved", renderingOff: true });
    expect(finished.stage).not.toBe("awaiting_approval");
    expect(finished.stageMessage).toContain("video rendering is turned off");
    expect(finished.pendingSteps).toEqual([]);
    expect(kyron.renders()).toBe(0);
  });

  it("refuses an approval when the lesson changed in Kyron since QA checked it", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    kyron.setNarration("Someone edited this in Kyron after QA finished.");

    await expect(approveRender(run.id, user)).rejects.toBeInstanceOf(QaConflictError);
    expect(kyron.renders()).toBe(0);
    expect((await repository.getRun(run.id))?.renderApproval?.status).toBe("pending");
    expect((await repository.getLatestWorkspaceRun("ws-1", "lesson"))?.id).not.toBe(run.id);
  });

  it("never starts a render without an approval, even if one is queued", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await repository.updateRun(run.id, (current) => ({ ...current, pendingSteps: [{ kind: "video_request" }] }));

    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(0);
    expect(finished.stage).toBe("awaiting_approval");
    expect(finished.events.some((event) => event.message.includes("waits for a person's approval"))).toBe(true);
  });

  it("does not retry a failed render request, so one failure cannot pay twice", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true, failRender: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.attempts()).toBe(1);
    expect(finished.videoRequests).toBe(1);
    expect(finished.media).toMatchObject({ status: "failed" });
  });

  it("records a failed render by name and does not check the captions of the rest", async () => {
    const failure = 'Kyron could not render the video for "Introduction".';

    mocks.videoStatuses = [{ status: "pending" }, { status: "failed", message: failure }];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(1);
    expect(kyron.captionReads()).toBe(0);
    expect(finished.media).toMatchObject({ status: "failed", message: failure, fileName: "Kyron render" });
    expect(finished.stageMessage).toContain(failure);
    expect(finished.events.some((event) => event.level === "error" && event.message.includes(failure))).toBe(true);
  });

  it("waits past the previous render's result until the new one is seen in progress", async () => {
    // Right after the request Kyron still shows the old failure.
    mocks.videoStatuses = [{ status: "failed", message: "old failure" }, { status: "pending" }, { status: "done" }];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.statusChecks()).toBe(3);
    expect(finished.media).toMatchObject({ status: "checked" });
    expect(finished.videoRequests).toBe(1);
  });

  it("accepts a finished result after 10 checks when the render was never seen in progress", async () => {
    mocks.videoStatuses = Array.from({ length: 12 }, () => ({ status: "done" as const }));

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.statusChecks()).toBe(10);
    // The source is told when the tenth check's result will count.
    expect(kyron.resultCounts()).toEqual([...Array.from({ length: 9 }, () => false), true]);
    expect(finished.media).toMatchObject({ status: "checked" });
  });

  it("checks again after a Kyron hiccup instead of giving up on a paid render", async () => {
    const hiccup = () => new KyronMcpError("KYRON_MCP_UNAVAILABLE", "Kyron MCP timed out.", true);

    mocks.videoStatuses = [{ status: "pending" }, hiccup(), hiccup(), hiccup(), { status: "done" }];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(1);
    expect(finished.media).toMatchObject({ status: "checked" });
    expect(finished.events.filter((event) => event.message.includes("checking again"))).toHaveLength(3);
  });

  it("gives a render's first check the state read before the request, then each check the last one's", async () => {
    mocks.videoStatuses = [
      { status: "pending", pollState: { staleFailures: [], sawRendering: true } },
      { status: "pending", pollState: { staleFailures: [], sawRendering: true, staleWaits: 1 } },
      { status: "done", pollState: { staleFailures: [] } },
    ];

    const kyron = fakeKyronSource(fixedPacket(), { video: true, baseline: { staleFailures: ["intro"] } });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    await runToCompletion(run.id);

    expect(kyron.pollStates()).toEqual([
      { staleFailures: ["intro"] },
      { staleFailures: [], sawRendering: true },
      { staleFailures: [], sawRendering: true, staleWaits: 1 },
    ]);
  });

  it("tells the source whether a finished result would count yet", async () => {
    // Ignored: not yet seen rendering. Then seen in progress, and done counts.
    mocks.videoStatuses = [{ status: "done" }, { status: "pending" }, { status: "done" }];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.resultCounts()).toEqual([false, false, true]);
    expect(finished.media).toMatchObject({ status: "checked" });
  });

  it("records when a waiting run's next check is due, so open pages can wait for it", async () => {
    fakeKyronSource(fixedPacket(), { video: true });

    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    // Steps that do not wait leave nothing due.
    expect((await runToCompletion(run.id)).nextStepAt).toBeNull();
    expect((await getRunDetail(run.id, user)).nextStepInMs).toBeNull();

    process.env.QA_VIDEO_POLL_MS = "30000";
    await approveRender(run.id, user);

    const before = Date.now();
    const requested = await processNextStep(run.id);

    expect(requested?.pendingSteps[0]).toMatchObject({ kind: "video_poll" });
    expect(requested?.nextStepAt).toBeGreaterThanOrEqual(before + 30_000);
    expect(Math.abs((requested?.nextStepAt ?? 0) - (requested?.lease?.expiresAt ?? 0))).toBeLessThan(50);
    // Nobody can take the run before then, and the page is told how long to wait.
    expect(await processNextStep(run.id)).toBeNull();
    expect((await getRunDetail(run.id, user)).nextStepInMs).toBeGreaterThan(29_000);

    // Once it is due, a check that leaves no wait clears it.
    process.env.QA_VIDEO_POLL_MS = "0";
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(Date.now() + 30_001);

      const checked = await processNextStep(run.id);

      expect(checked?.pendingSteps[0]).toMatchObject({ kind: "video_poll", attempt: 2 });
      expect(checked?.nextStepAt).toBeNull();
      expect((await getRunDetail(run.id, user)).nextStepInMs).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries an error that happens before the render request is sent, without counting a render", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    // The budget read fails once (a database hiccup), before anything reaches Kyron.
    mocks.budgetError = new Error("fetch failed");

    const finished = await runToCompletion(run.id);

    expect(kyron.attempts()).toBe(1);
    expect(finished.videoRequests).toBe(1);
    expect(finished.media).toMatchObject({ status: "checked" });
  });

  it("clears the request marker when Kyron refuses before taking the request", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    (mocks.kyronSource as { requestVideo: () => Promise<string> }).requestVideo = async () => {
      throw new KyronMcpError("KYRON_MCP_NOT_CONNECTED", "Kyron is not connected. Use Connect Kyron first.");
    };

    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(0);
    expect(finished.stage).toBe("blocked");
    expect(finished.videoRequestStartedAt ?? null).toBeNull();
    expect(finished.videoRequests ?? 0).toBe(0);
  });

  it("stops after a second try when a status check keeps failing for good", async () => {
    mocks.videoStatuses = [{ status: "pending" }, new Error("Kyron validate_lesson failed: bad input."), new Error("Kyron validate_lesson failed: bad input.")];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.statusChecks()).toBe(3);
    expect(finished.media).toMatchObject({
      status: "failed",
      message: "The video check could not finish: Kyron validate_lesson failed: bad input.",
    });
    expect(finished.stageMessage).toContain("The video check could not finish");
  });

  it("does not send an interrupted re-render request again", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    await runToCompletion(run.id);
    // After the first render, a re-render request saved its marker, then the process died.
    await repository.updateRun(run.id, (current) => ({
      ...current,
      pendingSteps: [{ kind: "video_request" }],
      videoRequestStartedAt: "2026-11-11T12:00:00.000Z",
    }));

    const finished = await runToCompletion(run.id);

    expect(kyron.attempts()).toBe(1);
    expect(finished.videoRequests).toBe(2);
    expect(finished.events.some((event) => event.message.includes("interrupted earlier"))).toBe(true);
  });

  it("measures lengths and flags misfits without blocking or fixing them", async () => {
    // Normal (a 900-second lesson): the few-second intro video is far too short.
    fakeKyronSource({ ...fixedPacket(), lesson: { ...fixedPacket().lesson, durationSeconds: 900 } });

    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);
    const lengthFinding = finished.findings.find((finding) => finding.evaluator === "length");

    expect(finished.lengths).toMatchObject({ level: "normal", assets: [{ activityId: "intro", kind: "video" }] });
    expect(lengthFinding).toMatchObject({ severity: "minor", status: "open", proposedPatch: null });
    expect(finished.stage).toBe("awaiting_approval");
  });

  it("refuses an approval while the budget is spent, so no render goes unchecked", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    mocks.budgetProblem = "This course reached its model budget ($1.0000 of $1.00).";

    await expect(approveRender(run.id, user)).rejects.toThrow("No render was started");
    expect((await repository.getRun(run.id))?.renderApproval?.status).toBe("pending");
    expect(kyron.renders()).toBe(0);
  });

  it("approves again to render once rendering is turned on", async () => {
    const kyron = fakeKyronSource(fixedPacket());
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    await expect(approveRender(run.id, user)).rejects.toThrow("still turned off");

    (mocks.kyronSource as { supportsVideo: boolean }).supportsVideo = true;

    const again = await approveRender(run.id, user);

    expect(again.run.renderApproval).toMatchObject({ status: "approved", renderingOff: false });

    await runToCompletion(run.id);
    expect(kyron.renders()).toBe(1);
  });

  it("lets only the owner or the admin approve, and only the latest check", async () => {
    fakeKyronSource(fixedPacket(), { video: true });

    const lesson = await saveLesson("ws-1");
    const first = await startQaRun({ createdBy: "Tester", lesson, snapshot: null, source: "kyron_mcp", target: "lesson" });

    await runToCompletion(first.id);

    const staff = { id: "access-developer", name: "CPE Test", email: "d@example.com", role: "developer" as const };

    await expect(approveRender(first.id, staff)).rejects.toThrow("not found");

    const second = await startQaRun({ createdBy: "Tester", lesson, snapshot: null, source: "kyron_mcp", target: "lesson" });

    await runToCompletion(second.id);
    await expect(approveRender(first.id, user)).rejects.toThrow("newer QA check");
  });

  it("does not request a render again after an interrupted request", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    // The earlier attempt saved its marker and baseline, and then the process died.
    await repository.updateRun(run.id, (current) => ({
      ...current,
      videoRequestStartedAt: "2026-11-11T12:00:00.000Z",
      videoPollState: { staleFailures: ["intro"] },
    }));

    const finished = await runToCompletion(run.id);

    expect(kyron.attempts()).toBe(0);
    expect(kyron.pollStates()[0]).toEqual({ staleFailures: ["intro"] });
    expect(finished.videoRequests).toBe(1);
    expect(finished.events.some((event) => event.message.includes("interrupted earlier"))).toBe(true);
  });

  it("keeps checking an interrupted request's render even once the budget is spent", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    await repository.updateRun(run.id, (current) => ({ ...current, videoRequestStartedAt: "2026-11-11T12:00:00.000Z" }));
    // Another check of the course spent the budget while this one was down.
    mocks.budgetProblem = "This course reached its model budget ($1.0000 of $1.00).";

    const finished = await runToCompletion(run.id);

    expect(kyron.attempts()).toBe(0);
    expect(kyron.statusChecks()).toBeGreaterThan(0);
    // The render is counted, not reported as never requested.
    expect(finished.videoRequests).toBe(1);
    expect(finished.events.some((event) => event.message.includes("No render was requested"))).toBe(false);
  });

  it("retries a render request that failed before reaching Kyron, and pays once", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const source = mocks.kyronSource as { requestVideo: (lesson: QaLesson) => Promise<string> };
    const send = source.requestVideo;
    let calls = 0;

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    // The first try times out while connecting to Kyron.
    source.requestVideo = async (lesson) => {
      calls += 1;

      if (calls === 1) {
        throw new RenderNotSentError(new KyronMcpError("KYRON_MCP_UNAVAILABLE", "Kyron MCP timed out.", true));
      }

      return send(lesson);
    };

    const finished = await runToCompletion(run.id);

    expect(calls).toBe(2);
    expect(kyron.renders()).toBe(1);
    expect(finished.videoRequests).toBe(1);
    expect(finished.media).toMatchObject({ status: "checked" });
    expect(finished.events.some((event) => event.message.includes("before anything was sent to Kyron"))).toBe(true);
  });

  it("does not count an old error alone as the render being seen in progress", async () => {
    // Only waiting on an old error, then every video ready: still the old state?
    mocks.videoStatuses = [
      { status: "pending", inProgress: false },
      ...Array.from({ length: 12 }, () => ({ status: "done" as const })),
    ];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(run.id);
    await approveRender(run.id, user);

    const finished = await runToCompletion(run.id);

    expect(kyron.statusChecks()).toBe(10);
    expect(finished.media).toMatchObject({ status: "checked" });

    // Seen rendering after that: the result counts at once.
    mocks.videoStatuses = [{ status: "pending", inProgress: false }, { status: "pending" }, { status: "done" }];

    const again = fakeKyronSource(fixedPacket(), { video: true });
    const second = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-2"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    await runToCompletion(second.id);
    await approveRender(second.id, user);
    await runToCompletion(second.id);
    expect(again.statusChecks()).toBe(3);
  });

  it("stops model calls once the course reaches its budget", async () => {
    mocks.budgetProblem = "This course reached its model budget ($1.0000 of $1.00).";
    fakeKyronSource(lessonPacket);

    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("blocked");
    expect(finished.stageMessage).toContain("model budget");
  });

  it("blocks instead of skipping checks when the token budget runs out", async () => {
    process.env.QA_RUN_TOKEN_BUDGET = "1";
    fakeKyronSource(lessonPacket);

    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(finished.stage).toBe("blocked");
    expect(finished.stageMessage).toContain("token budget");
  });
});

// On Vercel a function is stopped after 300 s, without running any catch:
// the step's claim is never released and its lease runs out.
describe("steps whose attempt never finished", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function stopAttempt(runId: string) {
    expect(await repository.claimRun(runId)).not.toBeNull();
    vi.setSystemTime(Date.now() + 300_001);
  }

  async function lessonRun() {
    return startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
  }

  async function approvedRender(kyron: ReturnType<typeof fakeKyronSource>) {
    const run = await lessonRun();

    await runToCompletion(run.id);
    await approveRender(run.id, user);
    expect(kyron.attempts()).toBe(0);

    return run;
  }

  it("counts a stopped step as a failure, tries it once more, then stops the run", async () => {
    fakeKyronSource(fixedPacket());
    const run = await lessonRun();

    await stopAttempt(run.id);
    const retried = await processNextStep(run.id);

    expect(retried?.pendingSteps[0]).toEqual({ kind: "snapshot" });
    expect(retried?.claimsWithoutRelease).toBe(0);
    expect(retried?.events.at(-1)?.message).toContain("did not finish within 5 minutes");

    await stopAttempt(run.id);
    const stopped = await processNextStep(run.id);

    expect(stopped?.stage).toBe("blocked");
    expect(stopped?.stageMessage).toContain("did not finish within 5 minutes");
  });

  it("marks a check stopped twice as not tested and goes on", async () => {
    fakeKyronSource(fixedPacket());
    const run = await lessonRun();
    const check = (await processNextStep(run.id))?.pendingSteps[0];

    expect(check?.kind).toBe("check");

    await stopAttempt(run.id);
    await processNextStep(run.id);
    await stopAttempt(run.id);

    const after = await processNextStep(run.id);

    expect(after?.pendingSteps[0]).not.toEqual(check);
    expect(after?.events.at(-1)?.message).toMatch(/could not run: The step did not finish within 5 minutes/);
  });

  it("keeps checking a paid render through stopped checks, up to six tries", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await approvedRender(kyron);

    expect((await processNextStep(run.id))?.pendingSteps[0]).toMatchObject({ kind: "video_poll" });

    for (let stopped = 1; stopped <= 5; stopped += 1) {
      await stopAttempt(run.id);
      expect((await processNextStep(run.id))?.pendingSteps[0]).toMatchObject({ kind: "video_poll" });
    }

    await stopAttempt(run.id);

    expect((await processNextStep(run.id))?.media).toMatchObject({
      status: "failed",
      message: expect.stringContaining("did not finish within 5 minutes"),
    });
    expect(kyron.renders()).toBe(1);
  });

  it("never sends a render request again once Kyron may have it", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await approvedRender(kyron);

    // Stopped after the request marker was saved.
    await repository.updateRun(run.id, (current) => ({ ...current, videoRequestStartedAt: new Date().toISOString() }));
    await stopAttempt(run.id);

    const resumed = await processNextStep(run.id);

    expect(kyron.attempts()).toBe(0);
    expect(resumed?.pendingSteps[0]).toMatchObject({ kind: "video_poll" });
    expect(resumed?.videoRequests).toBe(1);
  });

  it("keeps the request marker when picking up an earlier request fails, so no second render is sent", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await approvedRender(kyron);

    await repository.updateRun(run.id, (current) => ({ ...current, videoRequestStartedAt: new Date().toISOString() }));
    await stopAttempt(run.id);

    // A passing database error while the resumed attempt starts.
    const getLesson = vi.spyOn(repository, "getLesson").mockRejectedValueOnce(new Error("fetch failed"));
    const retried = await processNextStep(run.id);

    getLesson.mockRestore();

    expect(retried?.videoRequestStartedAt).toBeTruthy();
    expect(retried?.events.at(-1)?.message).toContain("picking up the earlier render request");
    expect((await processNextStep(run.id))?.pendingSteps[0]).toMatchObject({ kind: "video_poll" });
    expect(kyron.attempts()).toBe(0);
  });

  it("counts a render request stopped before anything was sent, then sends it once", async () => {
    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await approvedRender(kyron);

    await stopAttempt(run.id);

    const retried = await processNextStep(run.id);

    expect(kyron.attempts()).toBe(0);
    expect(retried?.pendingSteps[0]).toEqual({ kind: "video_request" });
    expect(retried?.events.at(-1)?.message).toContain("before anything was sent to Kyron");

    await processNextStep(run.id);

    expect(kyron.attempts()).toBe(1);
  });

  it("waits before trying a failed step again", async () => {
    process.env.QA_STEP_RETRY_MS = "30000";
    fakeKyronSource(fixedPacket());

    const run = await lessonRun();

    await stopAttempt(run.id);

    expect((await processNextStep(run.id))?.nextStepAt).toBe(Date.now() + 30_000);
    expect(await processNextStep(run.id)).toBeNull();
  });
});

describe("the scheduler tick", () => {
  it("keeps advancing runs until nothing is left or its window closes", async () => {
    fakeKyronSource(fixedPacket());

    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });

    // The window is already over: one round only.
    expect(await driveQaRunsUntil(Date.now() - 1)).toBe(1);
    expect((await repository.getRun(run.id))?.pendingSteps.length).toBeGreaterThan(0);

    expect(await driveQaRunsUntil(Date.now() + 45_000)).toBeGreaterThan(1);
    expect((await repository.getRun(run.id))?.pendingSteps).toEqual([]);
  });
});

// The lesson as Kyron returns it: narration lives in scenes.
function scenePacket(): LessonPacket {
  const scenes = [
    { id: "s1", part: "lecture_video", title: "Overfitting", onScreenText: null, narration: "Overfitting means memorizing noise.", hasVideo: false },
    { id: "s2", part: "lecture_video", title: "Accuracy", onScreenText: null, narration: "Increasing training accuracy always improves performance on unseen data.", hasVideo: false },
  ];

  return {
    ...lessonPacket,
    activities: [{
      ...lessonPacket.activities[0],
      narration: scenes.map((scene) => scene.narration).join("\n\n"),
      scenes,
      readOnlyFields: ["narration", "onScreenText"],
    }],
  };
}

function fixedPacket(): LessonPacket {
  return {
    ...lessonPacket,
    activities: [{ ...lessonPacket.activities[0], narration: "Training accuracy does not always improve unseen performance." }],
  };
}

async function runToCompletion(runId: string) {
  for (let step = 0; step < 60; step += 1) {
    const run = await repository.getRun(runId);

    if (!run || run.pendingSteps.length === 0) {
      return run!;
    }

    await processNextStep(runId);
  }

  throw new Error("Run did not finish within 60 steps.");
}

async function versionsOf(lessonId: string) {
  return (await repository.listContentVersions({ lessonId }, { page: 1, pageSize: 50 })).items;
}

async function saveLesson(workspaceId: string): Promise<QaLesson> {
  return repository.saveLesson({
    id: `lesson-${workspaceId}`,
    title: "Overfitting",
    domain: "cpe",
    workspaceId,
    ownerId: user.id,
    kyronLessonId: 42,
    createdAt: new Date().toISOString(),
    createdBy: "Tester",
    latestSnapshotId: null,
    latestRunId: null,
  });
}

function fakeWorkspace(id: string): DraftWorkspace {
  return {
    id,
    name: "Overfitting",
    createdBy: { id: user.id, name: user.name, email: user.email },
    kyronDraftId: null,
  } as DraftWorkspace;
}

function fakeSetupSource(overrides: { learningObjective: string; description?: string }) {
  let setup = {
    name: "Why models overfit",
    description: overrides.description ?? "How training and test accuracy diverge.",
    learningObjective: overrides.learningObjective,
    audience: "High-school students",
    assetType: "lesson" as const,
    duration: 480 as const,
  };
  const fields: Record<string, keyof typeof setup> = {
    "setup.name": "name",
    "setup.description": "description",
    "setup.learningObjective": "learningObjective",
    "setup.audience": "audience",
  };
  const unused = async () => {
    throw new Error("not used");
  };

  mocks.setupSource = {
    kind: "workspace_setup",
    readable: true,
    writable: true,
    supportsVideo: false,
    readLesson: async () =>
      buildSetupPacket(setup, [{ title: "Source", text: "Overfitting: training and test accuracy diverge." }]),
    readField: async (_lesson, _activityId, fieldPath) => String(setup[fields[fieldPath]] ?? ""),
    writeField: async (_lesson, _activityId, fieldPath, value) => {
      setup = { ...setup, [fields[fieldPath]]: value };
    },
    requestVideo: unused,
    getVideoStatus: unused,
    downloadVideo: unused,
  } satisfies LessonContentSource;

  return {
    current: () => setup,
    edit: (update: Partial<typeof setup>) => {
      setup = { ...setup, ...update };
    },
  };
}

function fakeKyronSource(
  initial: LessonPacket,
  { baseline = null, failRender = false, video = false }: { baseline?: VideoPollState | null; failRender?: boolean; video?: boolean } = {},
) {
  let current = structuredClone(initial);
  let renders = 0;
  let attempts = 0;
  // Status checks since the last render request, the state each was given,
  // and caption reads.
  let statusChecks = 0;
  const pollStates: Array<VideoPollState | null> = [];
  // Whether the pipeline said each check's finished result would count.
  const resultCounts: Array<boolean | undefined> = [];
  let captionReads = 0;
  const unused = async () => {
    throw new Error("not used");
  };

  mocks.kyronSource = {
    kind: "kyron_mcp",
    readable: true,
    writable: true,
    supportsVideo: video,
    readLesson: async () => structuredClone(current),
    readField: async (_lesson, activityId, fieldPath) => {
      const activity = current.activities.find((candidate) => candidate.id === activityId);

      return activity ? readActivityField(activity, fieldPath) : null;
    },
    writeField: async (_lesson, activityId, fieldPath, value) => {
      current = {
        ...current,
        activities: current.activities.map((activity) =>
          activity.id === activityId ? writeActivityField(activity, fieldPath, value) : activity,
        ),
      };
    },
    requestVideo: async () => {
      attempts += 1;

      if (failRender) {
        throw new Error("Kyron timed out after accepting the request.");
      }

      renders += 1;
      statusChecks = 0;

      return `render-${renders}`;
    },
    // Scripted results first; otherwise each render is seen in progress once,
    // then reported done.
    ...(baseline ? { readVideoBaseline: async () => baseline } : {}),
    getVideoStatus: async (_lesson, _jobId, pollState, options) => {
      statusChecks += 1;
      pollStates.push(pollState ?? null);
      resultCounts.push(options?.resultCounts);

      const next = mocks.videoStatuses.shift();

      if (next instanceof Error) {
        throw next;
      }

      return next ?? (statusChecks === 1 ? { status: "pending" } : { status: "done" });
    },
    downloadVideo: unused,
    readRenderedNarration: async () => {
      captionReads += 1;

      return mocks.transcripts[renders - 1] ?? "";
    },
  } satisfies LessonContentSource;

  return {
    attempts: () => attempts,
    captionReads: () => captionReads,
    pollStates: () => pollStates,
    resultCounts: () => resultCounts,
    statusChecks: () => statusChecks,
    renders: () => renders,
    scene: (id: string) => current.activities[0].scenes?.find((scene) => scene.id === id)?.narration ?? "",
    narration: () => current.activities[0].narration ?? "",
    setNarration: (value: string) => {
      current = { ...current, activities: current.activities.map((activity) => ({ ...activity, narration: value })) };
    },
  };
}

// Setup findings take the checker's suggestion; lesson findings correct the
// overfitting claim, in the scene that says it when the lesson has scenes.
// Narration-match findings get no text fix (the video is rendered again).
function fakeRevision(finding: QaFinding, snapshot: QaLessonSnapshot): Revision | null {
  if (finding.proposedPatch) {
    return { ...finding.proposedPatch, findingIds: [finding.id] };
  }

  const activity = snapshot.activities.find((candidate) => candidate.id === finding.activityId);

  if (!activity) {
    return null;
  }

  // Nonsense text is replaced with real narration in the field it was found in.
  if (finding.criterionId === "structure.no-placeholders" && finding.fieldPath) {
    return {
      findingIds: [finding.id],
      activityId: activity.id,
      fieldPath: finding.fieldPath,
      currentValue: readActivityField(activity, finding.fieldPath) ?? "",
      proposedValue: "Overfitting is when a model memorizes noise in its training data.",
      rationale: "Replace nonsense with real narration.",
      protectedField: false,
    };
  }

  const scene = activity.scenes?.find((candidate) => candidate.narration?.includes("always improves"));
  const current = scene ? (scene.narration ?? "") : (activity.narration ?? "");

  return {
    findingIds: [finding.id],
    activityId: finding.activityId,
    fieldPath: scene ? `scenes.${scene.id}.narration` : "narration",
    currentValue: current,
    proposedValue: current.replace("always improves", "does not always improve"),
    rationale: "Agree with the reference.",
    protectedField: false,
  };
}

// Flags a vague objective and an off-topic description (critical), both with
// a proposed fix, and an "UNFIXABLE" description with no fix at all.
async function fakeCourseSetup({ snapshot }: EvaluationInput): Promise<EvaluationOutput> {
  const objective = snapshot.lesson.learningObjectives[0] ?? "";
  const description = snapshot.lesson.description ?? "";
  const findings: EvaluationOutput["findings"] = [];

  if (objective.startsWith("Understand")) {
    findings.push(setupFinding("setup.objective-measurable", "setup.learningObjective", "major", objective,
      "Explain how training and test accuracy reveal overfitting."));
  }

  if (description === "OFF-TOPIC") {
    findings.push(setupFinding("setup.source-fidelity", "setup.description", "critical", description,
      "How training and test accuracy diverge."));
  }

  if (description === "UNFIXABLE") {
    findings.push({
      ...setupFinding("setup.source-fidelity", "setup.description", "critical", description, ""),
      proposedPatch: null,
    });
  }

  return {
    checks: ["setup.source-fidelity", "setup.objective-measurable", "setup.audience-grounded", "setup.scope-fit", "setup.title-clear"].map(
      (criterionId) => ({
        criterionId,
        evaluator: "course_setup",
        activityId: null,
        status: findings.some((finding) => finding.criterionId === criterionId) ? "fail" : "pass",
        summary: "",
      }),
    ),
    findings,
    usage: [{ purpose: "qa.course_setup", inputTokens: 80, outputTokens: 40, reasoningTokens: 10 }],
  };
}

function setupFinding(
  criterionId: string,
  fieldPath: string,
  severity: "critical" | "major",
  currentValue: string,
  proposedValue: string,
): EvaluationOutput["findings"][number] {
  return {
    criterionId,
    evaluator: "course_setup",
    activityId: null,
    fieldPath,
    severity,
    observedText: currentValue,
    expectedBehavior: "Fix it.",
    rationale: "Test finding.",
    evidence: [],
    retest: "Re-check.",
    proposedPatch: { activityId: null, fieldPath, currentValue, proposedValue, rationale: "Test.", protectedField: false },
  };
}

function passing(evaluator: "structural" | "assessment" | "consistency" | "alignment", criteria: string[]) {
  return async ({ snapshot }: EvaluationInput): Promise<EvaluationOutput> => ({
    checks: criteria.flatMap((criterionId) =>
      snapshot.activities.map((activity) => ({
        criterionId,
        evaluator,
        activityId: activity.id,
        status: "pass" as const,
        summary: "ok",
      })),
    ),
    findings: [],
    usage: [],
  });
}

async function fakeFidelity({ activityIds, snapshot }: EvaluationInput): Promise<EvaluationOutput> {
  const activities = snapshot.activities.filter((activity) => !activityIds || activityIds.includes(activity.id));
  const wrong = activities.filter((activity) => activity.narration?.includes("always improves"));

  return {
    checks: activities.map((activity) => ({
      criterionId: "accuracy.claims-supported",
      evaluator: "fidelity",
      activityId: activity.id,
      status: wrong.includes(activity) ? "fail" : "pass",
      summary: "",
    })),
    findings: wrong.map((activity) => ({
      criterionId: "accuracy.claims-supported",
      evaluator: "fidelity",
      activityId: activity.id,
      fieldPath: "narration",
      severity: "major",
      observedText: activity.narration,
      expectedBehavior: "Agree with the reference.",
      rationale: "Contradicts the reference.",
      evidence: [],
      retest: "Re-check.",
    })),
    usage: [{ purpose: "qa.fidelity", inputTokens: 100, outputTokens: 50, reasoningTokens: 10 }],
  };
}

// The first finding other than the length check's (which runs early and is
// only informational).
function firstFinding(run: { findings: QaFinding[] }): QaFinding {
  const finding = run.findings.find((candidate) => candidate.evaluator !== "length");

  if (!finding) {
    throw new Error("The run has no finding besides length.");
  }

  return finding;
}
