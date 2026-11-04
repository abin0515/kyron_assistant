import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LessonContentSource } from "@/server/qa/content-sources";
import type { EvaluationInput, EvaluationOutput } from "@/server/qa/evaluators/types";
import type { LessonPacket } from "@/server/qa/types";
import type { Revision } from "@/server/qa/revision-agent";
import type { DraftWorkspace, QaFinding, QaLesson, QaLessonSnapshot } from "@/types/api";

const mocks = vi.hoisted(() => ({
  setupSource: null as unknown,
  kyronSource: null as unknown,
  budgetProblem: null as string | null,
  verdict: "resolves" as string,
  // One verdict per verifier call, in order; then `verdict`.
  verdicts: [] as string[],
  transcripts: [] as string[],
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
  courseBudgetProblem: async () => mocks.budgetProblem,
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
      structural: passing("structural", ["structure.required-fields", "structure.no-placeholders", "structure.question-integrity"]),
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
import { processNextStep, startQaRun } from "@/server/qa/pipeline";
import * as repository from "@/server/qa/repository";
import { assertSetupReadyForSubmission, QaSubmissionGateError } from "@/server/qa/service";
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
  mocks.kyronSource = null;
  mocks.budgetProblem = null;
  mocks.verdict = "resolves";
  mocks.verdicts = [];
  mocks.transcripts = [];
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
    expect(finished.findings[0]).toMatchObject({ status: "fixed", repairAttempts: 1 });
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
    expect(finished.findings[0]).toMatchObject({
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

    expect(finished.stage).toBe("passed");
    expect(finished.findings[0]).toMatchObject({ status: "fixed", repairAttempts: 1 });
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

    expect(finished.stage).toBe("escalated");
    expect(finished.findings[0].escalationReason).toContain("changed since it was checked");
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

    expect(finished.stage).toBe("passed");
    expect(kyron.scene("s2")).toContain("does not always improve");
    expect(kyron.scene("s1")).toBe("Overfitting means memorizing noise.");
    expect(revised.changes).toMatchObject([{ activityId: "intro", fieldPath: "scenes.s2.narration" }]);
    expect(finished.events.some((event) => event.message.startsWith("QA verifier: 1 resolves"))).toBe(true);
    expect(finished.usageByPurpose["qa.verify"]).toMatchObject({ calls: 1 });
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
    expect(finished.findings[0]).toMatchObject({ status: "escalated", repairAttempts: 2 });
    expect(finished.findings[0].escalationReason).toContain("Still failing after 2 automatic fixes");
    expect(finished.findings[0].escalationReason).toContain("independent check rejected the last fix");
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

    expect(finished.stage).toBe("passed");
    expect(kyron.narration()).toContain("does not always improve");
    expect(finished.findings[0]).toMatchObject({ status: "fixed", repairAttempts: 2, escalationReason: null });
  });

  it("renders the video after the script passes and re-renders once when the narration differs", async () => {
    mocks.transcripts = ["MISMATCH: the avatar skipped a sentence", "Training accuracy does not always improve unseen performance."];

    const kyron = fakeKyronSource(fixedPacket(), { video: true });
    const run = await startQaRun({
      createdBy: "Tester",
      lesson: await saveLesson("ws-1"),
      snapshot: null,
      source: "kyron_mcp",
      target: "lesson",
    });
    const finished = await runToCompletion(run.id);

    expect(kyron.renders()).toBe(2);
    expect(finished.videoRequests).toBe(2);
    expect(finished.media).toMatchObject({ status: "checked", source: "kyron_mcp" });
    expect(finished.findings.find((finding) => finding.evaluator === "media")).toMatchObject({ status: "fixed" });
    expect(finished.stage).toBe("passed");
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

function fakeKyronSource(initial: LessonPacket, { video = false } = {}) {
  let current = structuredClone(initial);
  let renders = 0;
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
      renders += 1;

      return `render-${renders}`;
    },
    getVideoStatus: async () => "done" as const,
    downloadVideo: unused,
    readRenderedNarration: async () => mocks.transcripts[renders - 1] ?? "",
  } satisfies LessonContentSource;

  return {
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
