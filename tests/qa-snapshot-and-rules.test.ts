import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EXAMPLE_LESSON_PACKET } from "./fixtures/example-lesson-packet";
import { containsQuote } from "@/server/qa/evaluators/lesson-text";
import { evaluateStructure } from "@/server/qa/evaluators/structural";
import {
  buildSnapshot,
  hashPacket,
  parseLessonPacket,
  readActivityField,
  writeActivityField,
} from "@/server/qa/snapshot";
import type { QaRubricPack } from "@/types/api";

const rubric = { criteria: [] } as unknown as QaRubricPack;

describe("lesson packet parsing", () => {
  it("accepts the example packet and records missing fields", () => {
    const parsed = parseLessonPacket(EXAMPLE_LESSON_PACKET);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    const snapshot = buildSnapshot({
      createdBy: "Tester",
      lessonId: "lesson-1",
      packet: parsed.packet,
      source: "manual",
    });

    expect(snapshot.activities.map((activity) => activity.id)).toEqual([
      "intro",
      "check-1",
      "talk-1",
      "fixes",
    ]);
    expect(snapshot.references).toHaveLength(1);
    expect(snapshot.missingFields).toEqual([]);
    expect(snapshot.contentHash).toBe(hashPacket(parsed.packet));
  });

  it("reports readable errors for malformed packets", () => {
    const parsed = parseLessonPacket({
      lesson: {},
      activities: [
        { id: "a", type: "lecture", narration: 4 },
        { id: "a", question: { options: [] } },
      ],
    });

    expect(parsed).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        "lesson.title is required.",
        "activities[0].type must be one of: instruction, question, conversation, scenario, reflection, other.",
        "activities[0].narration must be text.",
        "activities[1].question.prompt is required.",
        'Activity id "a" is used more than once.',
      ]),
    });
  });

  it("flags question activities without an answer key and talks without guidance", () => {
    const parsed = parseLessonPacket({
      lesson: { title: "T", learningObjectives: ["Do X"], audience: "Adults" },
      activities: [
        { id: "q", type: "question", question: { prompt: "Pick", options: [{ id: "A", text: "x" }] } },
        { id: "c", type: "conversation", narration: "Discuss." },
      ],
    });

    expect(parsed.ok && buildSnapshot({ createdBy: "t", lessonId: "l", packet: parsed.packet, source: "manual" }).missingFields).toEqual([
      { activityId: "q", field: "question.answerKey" },
      { activityId: "c", field: "tutorGuidance" },
    ]);
  });

  it("reads and writes patchable fields", () => {
    const parsed = parseLessonPacket(EXAMPLE_LESSON_PACKET);

    if (!parsed.ok) {
      throw new Error("example packet should parse");
    }

    const question = parsed.packet.activities[1];

    expect(readActivityField(question, "question.answerKey")).toBe("A");
    expect(writeActivityField(question, "question.answerKey", "B").question?.answerKey).toEqual(["B"]);
    expect(writeActivityField(parsed.packet.activities[0], "narration", "New").narration).toBe("New");
  });
});

describe("structural rules", () => {
  it("finds placeholder text and broken answer keys", async () => {
    const parsed = parseLessonPacket({
      ...EXAMPLE_LESSON_PACKET,
      activities: [
        ...EXAMPLE_LESSON_PACKET.activities.slice(0, 1),
        {
          id: "bad-key",
          type: "question",
          question: {
            prompt: "Which is right?",
            options: [
              { id: "A", text: "One" },
              { id: "B", text: "Two" },
            ],
            answerKey: ["C"],
          },
        },
        EXAMPLE_LESSON_PACKET.activities[3],
      ],
    });

    if (!parsed.ok) {
      throw new Error("packet should parse");
    }

    const snapshot = buildSnapshot({ createdBy: "t", lessonId: "l", packet: parsed.packet, source: "manual" });
    const result = await evaluateStructure({ snapshot, rubric, activityIds: null });

    expect(result.findings.map((finding) => [finding.criterionId, finding.activityId, finding.severity])).toEqual([
      ["structure.question-integrity", "bad-key", "critical"],
      ["structure.no-placeholders", "fixes", "major"],
    ]);
    expect(result.checks.find((check) => check.activityId === "intro" && check.criterionId === "structure.no-placeholders")?.status).toBe("pass");
    expect(result.usage).toEqual([]);
  });

  it("matches quotes regardless of case, spacing and curly quotes", () => {
    expect(containsQuote("It “always”   improves.", 'it "always" improves')).toBe(true);
    expect(containsQuote("Something else", "always improves")).toBe(false);
    expect(containsQuote("Anything", "  ")).toBe(false);
  });
});
