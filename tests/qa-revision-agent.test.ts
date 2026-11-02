import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  modelOutput: null as unknown,
  lastCall: null as null | { model?: string; purpose: string; schema: Record<string, unknown>; input: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/qa/model", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/qa/model")>();

  return {
    ...original,
    runStructuredModel: async (call: {
      model?: string;
      purpose: string;
      schema: Record<string, unknown>;
      input: string;
      parse: (value: unknown) => unknown;
    }) => {
      mocks.lastCall = call;

      return {
        value: call.parse(mocks.modelOutput),
        usage: { purpose: call.purpose, inputTokens: 10, outputTokens: 5, reasoningTokens: 1 },
      };
    },
  };
});

import { buildSetupPacket } from "@/server/qa/course-setup-fields";
import {
  editableFields,
  fieldKey,
  reviseContent,
  validateRevisions,
  type RawRevision,
} from "@/server/qa/revision-agent";
import { buildSnapshot } from "@/server/qa/snapshot";
import type { QaFinding } from "@/types/api";

const setupSnapshot = buildSnapshot({
  createdBy: "t",
  lessonId: "lesson-1",
  source: "workspace_setup",
  packet: buildSetupPacket(
    {
      name: "Intro to PDEs",
      description: "Classify PDEs by order and linearity.",
      learningObjective: "Understand PDEs.",
      audience: "Engineers",
      duration: 3600,
      assetType: "lesson",
    },
    [{ title: "Notes", text: "A PDE relates partial derivatives." }],
  ),
});

const lessonSnapshot = buildSnapshot({
  createdBy: "t",
  lessonId: "lesson-2",
  source: "manual",
  packet: {
    lesson: {
      title: "PDEs",
      description: null,
      audience: "Engineers",
      learningObjectives: ["Classify PDEs."],
      durationSeconds: 900,
      assetType: "lesson",
    },
    activities: [
      {
        id: "intro",
        title: null,
        type: "instruction",
        narration: "Every PDE is linear.",
        onScreenText: "All PDEs are linear",
        question: null,
        tutorGuidance: null,
        media: [],
      },
      {
        id: "q1",
        title: null,
        type: "question",
        narration: null,
        onScreenText: null,
        question: {
          prompt: "Which is linear?",
          options: [
            { id: "A", text: "u_t = u_xx" },
            { id: "B", text: "u_t = u u_x" },
          ],
          answerKey: ["B"],
          rationale: "Burgers is linear.",
        },
        tutorGuidance: null,
        media: [],
      },
    ],
    references: [],
  },
});

beforeEach(() => {
  mocks.modelOutput = null;
  mocks.lastCall = null;
});

describe("editable fields", () => {
  it("allows only the setup fields the findings name", () => {
    expect(editableFields(setupSnapshot, "course_setup", [finding("f1", null, "setup.duration")])).toEqual([
      fieldKey(null, "setup.duration"),
    ]);
  });

  it("allows related text fields of the same activity, but answer keys only when named", () => {
    const prompt = editableFields(lessonSnapshot, "lesson", [finding("f1", "q1", "question.prompt")]);
    const key = editableFields(lessonSnapshot, "lesson", [finding("f1", "q1", "question.answerKey")]);

    expect(prompt).toEqual([fieldKey("q1", "question.prompt"), fieldKey("q1", "question.rationale")]);
    expect(key).toContain(fieldKey("q1", "question.answerKey"));
  });
});

describe("revision validation", () => {
  const setupContext = (findings: QaFinding[]) => ({
    snapshot: setupSnapshot,
    target: "course_setup" as const,
    findings,
    allowedFields: new Set(editableFields(setupSnapshot, "course_setup", findings)),
  });

  it("accepts a valid change and records the current value", () => {
    const findings = [finding("f1", null, "setup.duration")];
    const { rejected, revisions } = validateRevisions([raw(["f1"], null, "setup.duration", "900")], setupContext(findings));

    expect(rejected).toEqual([]);
    expect(revisions).toEqual([
      expect.objectContaining({ findingIds: ["f1"], fieldPath: "setup.duration", currentValue: "3600", proposedValue: "900" }),
    ]);
  });

  it("rejects invalid, unchanged, duplicate and unlisted changes", () => {
    const findings = [finding("f1", null, "setup.duration"), finding("f2", null, "setup.learningObjective")];
    const { rejected, revisions } = validateRevisions(
      [
        raw(["f1"], null, "setup.duration", "1000"),
        raw(["f2"], null, "setup.learningObjective", "  Understand   PDEs. "),
        raw(["f2"], null, "setup.name", "Partial differential equations"),
        raw(["f2"], null, "setup.learningObjective", "Classify a PDE by order and linearity."),
        raw(["f2"], null, "setup.learningObjective", "Solve a PDE."),
        raw(["unknown"], null, "setup.description", "Ignored."),
      ],
      setupContext(findings),
    );

    expect(revisions.map((revision) => revision.proposedValue)).toEqual(["Classify a PDE by order and linearity."]);
    expect(rejected.map((item) => item.reason)).toEqual([
      '"1000" is not allowed for setup.duration.',
      "The new value for setup.learningObjective is empty or unchanged.",
      "setup.name is not an editable field.",
      "setup.learningObjective was revised more than once.",
    ]);
  });

  it("rejects unknown activities and answer keys that name missing options, and protects answer keys", () => {
    const findings = [finding("f1", "q1", "question.answerKey")];
    const context = {
      snapshot: lessonSnapshot,
      target: "lesson" as const,
      findings,
      allowedFields: new Set(editableFields(lessonSnapshot, "lesson", findings)),
    };

    expect(validateRevisions([raw(["f1"], "ghost", "narration", "Hi.")], context).rejected[0].reason).toBe(
      "activity ghost: narration is not an editable field.",
    );
    expect(validateRevisions([raw(["f1"], "q1", "question.answerKey", "C")], context).rejected[0].reason).toContain(
      "names options that do not exist",
    );
    expect(validateRevisions([raw(["f1"], "q1", "question.answerKey", "A")], context).revisions[0]).toMatchObject({
      currentValue: "B",
      proposedValue: "A",
      protectedField: true,
    });
  });
});

describe("revision agent", () => {
  it("uses the revision model, maps short ids back and leaves locked fields out", async () => {
    const findings = [finding("finding-a", "intro", "narration"), finding("finding-b", "intro", "onScreenText")];

    mocks.modelOutput = {
      revisions: [
        { findingIds: ["F1"], activityId: "intro", fieldPath: "narration", newValue: "Some PDEs are linear.", rationale: "Matches the notes." },
        { findingIds: ["F2"], activityId: "intro", fieldPath: "onScreenText", newValue: "Not all PDEs are linear", rationale: "Locked." },
      ],
      unresolved: [{ findingId: "F2", reason: "Locked by a person." }],
    };

    const result = await reviseContent({
      findings,
      lockedFields: [fieldKey("intro", "onScreenText")],
      snapshot: lessonSnapshot,
      target: "lesson",
    });

    expect(mocks.lastCall).toMatchObject({ model: "gpt-6-luna", purpose: "qa.revision" });
    expect(mocks.lastCall?.input).toContain("F1 [major] accuracy.claims-supported");
    expect(result.revisions).toEqual([
      expect.objectContaining({ findingIds: ["finding-a"], fieldPath: "narration", currentValue: "Every PDE is linear." }),
    ]);
    expect(result.unresolved).toEqual([{ findingId: "finding-b", reason: "Locked by a person." }]);
    expect(result.model).toBe("gpt-6-luna");
  });

  it("does not call the model when no finding names an editable field", async () => {
    const result = await reviseContent({
      findings: [finding("f1", null, "lesson.learningObjectives")],
      snapshot: lessonSnapshot,
      target: "lesson",
    });

    expect(mocks.lastCall).toBeNull();
    expect(result).toMatchObject({ revisions: [], usage: null, unresolved: [{ findingId: "f1" }] });
  });
});

function finding(id: string, activityId: string | null, fieldPath: string): QaFinding {
  return {
    id,
    snapshotId: "s1",
    criterionId: "accuracy.claims-supported",
    evaluator: "fidelity",
    activityId,
    fieldPath,
    severity: "major",
    status: "open",
    observedText: null,
    expectedBehavior: "Agree with the notes.",
    rationale: "Contradicts the notes.",
    evidence: [],
    retest: "Re-check.",
    proposedPatch: null,
    proposalAttempted: false,
    repairAttempts: 0,
    escalationReason: null,
    decision: null,
    createdAt: "2026-10-30T00:00:00Z",
  };
}

function raw(findingIds: string[], activityId: string | null, fieldPath: string, newValue: string): RawRevision {
  return { findingIds, activityId, fieldPath, newValue, rationale: "Because." };
}
