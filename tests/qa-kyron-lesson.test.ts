import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writes: [] as Array<{ name: string; args: Record<string, unknown> }>,
  writeError: null as Error | null,
  writeAccess: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/drafts/workspaces/repository", () => ({
  getDraftWorkspaceById: vi.fn(),
  updateDraftWorkspace: vi.fn(),
}));
vi.mock("@/server/kyron-mcp/service", async () => {
  const fixture = (await import("./fixtures/kyron-lesson-23930.json")).default as Record<string, unknown> & {
    activities: Record<string, unknown>;
    activityList: Array<{ id: number }>;
  };
  const read = async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "get_lesson_collection":
        return fixture.collection;
      case "get_lesson":
        return fixture.lesson;
      case "list_lesson_sections":
        return fixture.sections;
      case "list_lesson_activities":
        return fixture.activityList.filter((item) => String(item.id) in fixture.activities);
      case "get_lesson_activity":
        return fixture.activities[String(args.id)];
      case "list_vocabulary_items":
        return fixture.vocabulary;
      case "get_lesson_lock_version":
        return { lock_version: 7 };
      default:
        throw new Error(`Unexpected read ${name}`);
    }
  };
  const write = async (name: string, args: Record<string, unknown>) => {
    if (mocks.writeError) {
      throw mocks.writeError;
    }

    mocks.writes.push({ name, args });

    return {};
  };

  return {
    withKyronReader: async (run: (reader: typeof read) => unknown) => run(read),
    withKyronWriter: async (run: (session: { read: typeof read; write: typeof write }) => unknown) => run({ read, write }),
    hasKyronWriteAccess: async () => mocks.writeAccess,
  };
});

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { ContentConflictError } from "@/server/qa/content-errors";
import { resolveContentSource } from "@/server/qa/content-sources";
import { evaluateAssessment } from "@/server/qa/evaluators/assessment";
import {
  buildActivityUpdate,
  captionText,
  mapKyronLesson,
  parseActivity,
  readKyronLessonData,
  writeKyronField,
} from "@/server/qa/kyron-lesson";
import { buildSnapshot } from "@/server/qa/snapshot";
import type { QaLesson, QaRubricPack } from "@/types/api";

import fixture from "./fixtures/kyron-lesson-23930.json";

beforeEach(() => {
  mocks.writes.length = 0;
  mocks.writeError = null;
  mocks.writeAccess = true;
});

afterEach(() => {
  delete process.env.QA_KYRON_WRITES;
  delete process.env.QA_KYRON_VIDEO;
});

describe("reading a Kyron lesson", () => {
  it("maps the lesson, scenes, conversations and vocabulary into the QA snapshot", async () => {
    const packet = mapKyronLesson(await readKyronLessonData(14826));
    const [intro, lecture, conversation, vocabulary] = packet.activities;

    expect(packet.lesson).toMatchObject({
      title: "[QA Test] Introduction to PDEs - MIT 18.152 Class 1",
      durationSeconds: 900,
      learningObjectives: ["Given representative partial differential equations, classify each equation by its order and linearity."],
    });
    expect(packet.activities.map((activity) => activity.type)).toEqual(["instruction", "instruction", "conversation", "other"]);
    expect(intro.id).toBe("504101");
    expect(lecture.narration).toMatch(/^Now shift from order to the other classification feature/);
    expect(lecture.scenes).toHaveLength(4);
    expect(lecture.scenes?.[0]).toMatchObject({ part: "lecture_video", title: "Linearity vs Order" });
    expect(lecture.readOnlyFields).toEqual(["narration", "onScreenText"]);
    expect(conversation.question).toMatchObject({ options: [], answerKey: [] });
    expect(conversation.question?.prompt).toContain("still linear");
    expect(conversation.question?.rationale).toContain("linear");
    expect(conversation.tutorGuidance).toContain("Misconceptions to address");
    expect(vocabulary.terms?.some((term) => term.term.includes("black"))).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(/https?:\/\/|<p>/);
  });

  it("treats a lesson without multiple-choice questions as not applicable for assessment", async () => {
    const packet = mapKyronLesson(await readKyronLessonData(14826));
    const snapshot = buildSnapshot({ createdBy: "t", lessonId: "l", packet: { ...packet, references: [] }, source: "kyron_mcp" });
    const output = await evaluateAssessment({ snapshot, rubric: {} as QaRubricPack, activityIds: null });

    expect(output.checks.map((check) => check.status)).toEqual(["not_applicable", "not_applicable"]);
    expect(output.usage).toEqual([]);
  });
});

describe("writing to Kyron", () => {
  const lecture = parseActivity(fixture.activities["504105"]);
  const conversation = parseActivity(fixture.activities["504106"]);
  const firstScene = lecture.scenes[0];

  it("writes scene narration as stored HTML and keeps the lecture script in step", () => {
    const update = buildActivityUpdate(lecture, `scenes.${firstScene.id}.narration`, "Linearity is the second feature.");

    expect(update.lecture_video).toEqual({
      scenes: [{ id: Number(firstScene.id), scene_narration: "<p>Linearity is the second feature.</p>" }],
    });
    expect(update.content).toContain("Linearity is the second feature.");
    expect(update.content).not.toContain(firstScene.narration);
    expect(update).not.toHaveProperty("generate_video");
  });

  it("keeps bullet formatting for on-screen text and maps conversation fields", () => {
    const bulleted = lecture.scenes.find((scene) => /<li[\s>]/.test(scene.rawText));

    if (bulleted) {
      const update = buildActivityUpdate(lecture, `scenes.${bulleted.id}.onScreenText`, "- First point\n- Second point");

      expect(JSON.stringify(update)).toContain("<ul><li>First point</li><li>Second point</li></ul>");
    }

    expect(buildActivityUpdate(conversation, "question.prompt", "New question?")).toEqual({ question: "New question?" });
    expect(buildActivityUpdate(conversation, "question.rationale", "New answer.")).toEqual({ answer: "New answer." });
    expect(() => buildActivityUpdate(lecture, "narration", "x")).toThrow(/scene by scene/);
    expect(() => buildActivityUpdate(conversation, "tutorGuidance", "x")).toThrow(/cannot be written/);
  });

  it("sends every edit with the lesson's lock version and turns a refusal into a conflict", async () => {
    await writeKyronField(14826, "504105", `scenes.${firstScene.id}.title`, "Order versus linearity");
    await writeKyronField(14826, "vocabulary", "vocabulary.209582.definition", "Not covered in this lesson.");
    await writeKyronField(14826, "", "lesson.audience", "Engineers new to PDEs");

    expect(mocks.writes.map((write) => write.name)).toEqual([
      "update_lesson_activity",
      "update_vocabulary_item",
      "update_lesson",
    ]);
    expect(mocks.writes[0].args).toMatchObject({ id: 504105, lesson_lock_version: 7 });
    expect(mocks.writes[1].args).toEqual({ id: 209582, definition: "Not covered in this lesson." });
    expect(mocks.writes[2].args).toEqual({ id: 23930, audience: "Engineers new to PDEs", lesson_lock_version: 7 });

    mocks.writeError = new KyronMcpError("KYRON_INVALID_RESPONSE", "Kyron update_lesson_activity failed: 409 Conflict");

    await expect(writeKyronField(14826, "504106", "question.prompt", "x")).rejects.toBeInstanceOf(ContentConflictError);
  });

  it("reads captions as plain text", () => {
    expect(captionText("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n<v Marcus>Now shift</v>\n\n2\n00:00:02.000 --> 00:00:04.000\nfrom order.")).toBe(
      "Now shift from order.",
    );
  });
});

describe("when the harness may change Kyron content", () => {
  const lesson = (title: string) => ({ title, kyronLessonId: 14826 }) as QaLesson;

  it("writes only to test drafts by default, and never without write permission", async () => {
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(true);
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).writable).toBe(false);

    mocks.writeAccess = false;

    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(false);
  });

  it("follows the write and video switches", async () => {
    process.env.QA_KYRON_WRITES = "off";
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).writable).toBe(false);

    process.env.QA_KYRON_WRITES = "all";
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).supportsVideo).toBe(false);

    process.env.QA_KYRON_VIDEO = "test-only";
    expect((await resolveContentSource("kyron_mcp", lesson("[QA Test] PDEs"))).supportsVideo).toBe(true);
    expect((await resolveContentSource("kyron_mcp", lesson("PDEs for CPE"))).supportsVideo).toBe(false);
  });
});
