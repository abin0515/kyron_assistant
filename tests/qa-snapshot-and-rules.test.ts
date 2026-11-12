import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EXAMPLE_LESSON_PACKET } from "./fixtures/example-lesson-packet";
import { containsQuote } from "@/server/qa/evaluators/lesson-text";
import { evaluateStructure, nonsenseIn } from "@/server/qa/evaluators/structural";
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

  it("flags nonsense scene text as a major finding at the exact scene", async () => {
    const scene = (id: string, narration: string, onScreenText: string | null = null) => ({
      id,
      part: "lecture_video",
      title: "Introduction",
      onScreenText,
      narration,
      hasVideo: false,
    });
    const scenes = [
      scene("s1", "abcdef"),
      scene("s2", "cdefgab"),
      scene("s3", "Welcome. First, we define what a partial differential equation is, then classify one."),
      scene("s4", "Its property and liberty to hijack the topic are real words.", 'Code: s = "abcdef"'),
      scene("s5", "Quadrilateral ABCD has four sides."),
    ];
    const parsed = parseLessonPacket({ ...EXAMPLE_LESSON_PACKET, activities: EXAMPLE_LESSON_PACKET.activities.slice(0, 1) });

    if (!parsed.ok) {
      throw new Error("packet should parse");
    }

    // As Kyron returns it: the narration lives in scenes.
    const packet = {
      ...parsed.packet,
      activities: [{ ...parsed.packet.activities[0], narration: scenes.map((item) => item.narration).join("\n\n"), scenes }],
    };
    const snapshot = buildSnapshot({ createdBy: "t", lessonId: "l", packet, source: "kyron_mcp" });
    const result = await evaluateStructure({ snapshot, rubric, activityIds: null });
    const nonsense = result.findings.filter((finding) => finding.criterionId === "structure.no-placeholders");

    expect(nonsense.map((finding) => [finding.fieldPath, finding.severity, finding.rationale])).toEqual([
      ["scenes.s1.narration", "major", '"abcdef" is not real text; learners would hear it.'],
      ["scenes.s2.narration", "major", '"cdefgab" is not real text; learners would hear it.'],
    ]);
  });

  it("tells nonsense apart from real text", () => {
    for (const text of ["abcdef", "cdefgab", "asdf", "qwerty", "aaaa", "Test.", "testing testing", "12345", "...", "ABCDEF"]) {
      expect(nonsenseIn(text, true), text).not.toBeNull();
    }

    for (const text of [
      "First, define the order of the equation.",
      "The property holds; do not hijack the definition.",
      "Hmmmm, let's test that idea with an example.",
      "Quadrilateral ABCD and the QWERTY layout.",
      'The string "abcdef" has six characters.',
      "Year 2024",
      "OK",
    ]) {
      expect(nonsenseIn(text, true), text).toBeNull();
    }

    // On-screen text may be just numbers or a label.
    expect(nonsenseIn("2024", false)).toBeNull();
    expect(nonsenseIn("ABCD", false)).toBeNull();
  });

  it("matches quotes regardless of case, spacing and curly quotes", () => {
    expect(containsQuote("It “always”   improves.", 'it "always" improves')).toBe(true);
    expect(containsQuote("Something else", "always improves")).toBe(false);
    expect(containsQuote("Anything", "  ")).toBe(false);
  });
});
