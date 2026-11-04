import { describe, expect, it, vi } from "vitest";

import fixture from "./fixtures/kyron-lesson-23930.json";

vi.mock("server-only", () => ({}));
vi.mock("@/server/kyron-mcp/service", () => ({
  withKyronReader: vi.fn(),
  withKyronWriter: vi.fn(),
  hasKyronWriteAccess: async () => false,
}));
vi.mock("@/server/qa/repository", () => ({
  findLessonByKyronDraft: vi.fn(),
  getContentVersion: vi.fn(),
  getRun: vi.fn(),
  listContentVersions: vi.fn(),
}));

import { mapDraftContent, type KyronDraftRecords } from "@/server/kyron-content/read-draft";
import { describeLocation, markAppliedProposals, revisionKind } from "@/server/kyron-content/revisions";
import { qaUseFor } from "@/server/kyron-mcp/qa-tools";
import { currentValues, latestRevisionByKey, liveStatus } from "@/features/kyron-content/revision-status";
import { diffWords } from "@/features/kyron-content/word-diff";
import { filterKyronTools, groupKyronTools } from "@/features/kyron-mcp/tool-groups";
import type { KyronMcpToolSummary, KyronRevisionVersion, QaVersionContent } from "@/types/api";

const activities = fixture.activities as Record<string, Record<string, unknown>>;

// The fixture plus the presentation settings and signed links a live read
// returns, so the test proves no link reaches the view.
function records(): KyronDraftRecords {
  const lecture = structuredClone(activities["504105"]) as Record<string, unknown> & {
    lecture_video: { scenes: Array<Record<string, unknown>> };
  };

  lecture.lecture_video.scenes[0].scene_video_url = "https://cdn.kyron.example/signed/video.mp4?sig=abc";

  return {
    collection: fixture.collection,
    lesson: {
      ...fixture.lesson,
      avatar_display_name: "Marcus D",
      avatar_visible: true,
      avatar_image_url: "https://cdn.kyron.example/avatar.png",
      logo_image_url: "https://cdn.kyron.example/logo.png?sig=1",
      tts_voice: { provider: "chirp3_hd", label: "Alex", sample_url: "https://cdn.kyron.example/voice.mp3" },
      tts_accent: { accent: "USA" },
      slide_template: "doodle",
      subtitle_languages: ["en"],
      grading_scheme: "completion",
      should_scenes_show_logo: true,
      custom_video_background_image_url: "https://cdn.kyron.example/bg.png",
      lesson_misconceptions: [
        { name: "Order Is Not Variable Count", description: "Confusing order and number of variables", target_activity_id: 504108 },
      ],
    },
    lockVersion: { lock_version: 3 },
    sections: fixture.sections,
    activities: [activities["504101"], lecture, activities["504106"]],
    vocabulary: fixture.vocabulary,
    validation: [{ name: "Some videos are missing", activity_ids: [504101, 504105] }],
  };
}

describe("Kyron draft content view", () => {
  const view = mapDraftContent(14826, records(), "2026-11-04T18:00:00.000Z");

  it("organizes the lesson, sections, activities, scenes and vocabulary", () => {
    expect(view).toMatchObject({ draftId: 14826, name: fixture.collection.name, status: "done", lockVersion: 3 });
    expect(view.sections[0]).toMatchObject({ id: 64011, topic: "PDE Order and Linearity" });
    expect(view.sections[0].essentialQuestions.length).toBeGreaterThan(0);
    expect(view.activities.map((activity) => [activity.id, activity.typeLabel])).toEqual([
      ["504101", "Introduction"],
      ["504105", "Lecture"],
      ["504106", "Clarifying conversation"],
    ]);
    expect(view.activities[1].scenes.map((scene) => scene.id)).toEqual(["610135", "610136", "610137", "610138"]);
    expect(view.activities[1].scenes[0]).toMatchObject({ partLabel: "Lecture video", hasVideo: true, hasCaptions: true });
    expect(view.activities[2].scenes.map((scene) => scene.partLabel)).toEqual(["Question video", "Wait video"]);
    expect(view.activities[2].modelAnswers.length).toBe(1);
    expect(view.activities[2].knowledge[0].misconceptions.length).toBeGreaterThan(0);
    expect(view.vocabulary[0].term.value).toBe("black–scholes equation");
    expect(view.misconceptions).toEqual([
      { name: "Order Is Not Variable Count", description: "Confusing order and number of variables", targetActivityId: 504108 },
    ]);
    expect(view.publishCheck).toEqual([{ name: "Some videos are missing", activityCount: 2 }]);
  });

  it("marks what the QA agent may do with each field, by the revision agent's rules", () => {
    const lecture = view.activities[1];
    const conversation = view.activities[2];
    const field = (fields: typeof lecture.fields, label: string) => fields.find((item) => item.label.startsWith(label));

    expect(lecture.scenes[0].fields.find((item) => item.label === "Narration")).toMatchObject({
      key: "504105::scenes.610135.narration",
      access: "qa_fixes",
    });
    expect(field(lecture.fields, "Script")).toMatchObject({ access: "qa_reads" });
    expect(field(conversation.fields, "Question")).toMatchObject({ key: "504106::question.prompt", access: "qa_fixes" });
    expect(field(conversation.fields, "Model answer")).toMatchObject({ access: "qa_fixes" });
    expect(view.lessonFields.find((item) => item.label === "Objective")).toMatchObject({
      key: "::lesson.objective",
      access: "qa_fixes",
    });
    expect(view.lessonFields.find((item) => item.label === "Intended time")).toMatchObject({ value: "15 min", access: "qa_reads" });
    expect(view.vocabulary[0].definition).toMatchObject({ key: "vocabulary::vocabulary.209582.definition", access: "qa_fixes" });
    expect(view.presentation.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Avatar", "Voice", "Slide template", "Subtitle languages", "Grading"]),
    );
  });

  it("never passes a link to the browser", () => {
    expect(JSON.stringify(view)).not.toMatch(/https?:|link removed/);
  });
});

describe("QA revision history", () => {
  const content: QaVersionContent = {
    lesson: { title: "PDEs", description: null, audience: null, learningObjectives: [], durationSeconds: null, assetType: null },
    activities: [
      {
        id: "504103",
        title: "Read PDE Notation",
        type: "instruction",
        narration: null,
        onScreenText: null,
        question: null,
        tutorGuidance: null,
        media: [],
        scenes: [
          { id: "610129", part: "lecture_video", title: "Notation", onScreenText: null, narration: "a", hasVideo: false },
          { id: "610130", part: "lecture_video", title: "Order of a PDE", onScreenText: null, narration: "b", hasVideo: false },
        ],
      },
      {
        id: "vocabulary",
        title: "Vocabulary",
        type: "other",
        narration: null,
        onScreenText: null,
        question: null,
        tutorGuidance: null,
        media: [],
        terms: [{ id: "209582", term: "black–scholes equation", definition: "x" }],
      },
    ],
  };

  it("places each change in plain words", () => {
    expect(describeLocation(content, "504103", "scenes.610130.narration")).toBe(
      "Read PDE Notation › Scene 2 “Order of a PDE” › Narration",
    );
    expect(describeLocation(content, "vocabulary", "vocabulary.209582.definition")).toBe(
      "Vocabulary › “black–scholes equation” › Definition",
    );
    expect(describeLocation(content, null, "lesson.objective")).toBe("Lesson › Objective");
    expect(describeLocation(null, "504106", "question.prompt")).toBe("Activity 504106 › Question");
  });

  it("sorts versions by who changed the content", () => {
    const change = [{ activityId: "1", fieldPath: "narration", before: "a", after: "b", rationale: "", findingIds: [], criterionIds: [] }];

    expect(revisionKind({ status: "applied", author: "QA revision agent", changes: change })).toBe("qa_applied");
    expect(revisionKind({ status: "applied", author: "QA revision agent, approved by a person", changes: change })).toBe("qa_approved");
    expect(revisionKind({ status: "proposed", author: "QA revision agent", changes: change })).toBe("qa_proposed");
    expect(revisionKind({ status: "applied", author: "Kyron generation", changes: change })).toBe("kyron_read");
    expect(revisionKind({ status: "applied", author: "Changed in Kyron outside the QA agent", changes: change })).toBe("outside_change");
  });

  it("marks a proposal a later QA version applied, and compares fixes with Kyron now", () => {
    const key = "504103::scenes.610130.narration";
    const versions = markAppliedProposals([
      version(6, "qa_approved", key, "fixed"),
      version(5, "qa_proposed", key, "fixed"),
    ]);

    expect(versions[1].changes[0].appliedInVersion).toBe(6);
    expect(latestRevisionByKey(versions).get(key)).toBe(6);

    const now = new Map([[key, "fixed "]]);

    expect(liveStatus("qa_approved", versions[0].changes[0], now)).toBe("in_kyron");
    expect(liveStatus("qa_approved", versions[0].changes[0], new Map([[key, "edited"]]))).toBe("changed_since");
    expect(liveStatus("qa_proposed", versions[1].changes[0], now)).toBe("applied_later");
    expect(liveStatus("qa_applied", versions[0].changes[0], null)).toBe("not_checked");
  });

  it("reads the current value of every revisable field from the content view", () => {
    const values = currentValues(mapDraftContent(14826, records(), "2026-11-04T18:00:00.000Z"));

    expect(values?.get("504105::scenes.610135.title")).toBe("Linearity vs Order");
    expect(values?.get("vocabulary::vocabulary.209582.term")).toBe("black–scholes equation");
  });
});

describe("word diff", () => {
  it("marks only the words that changed", () => {
    expect(diffWords("The order is the number of variables.", "The order is the highest derivative.")).toEqual([
      { text: "The order is the ", kind: "same" },
      { text: "number of variables.", kind: "removed" },
      { text: "highest derivative.", kind: "added" },
    ]);
    expect(diffWords("", "New text")).toEqual([{ text: "New text", kind: "added" }]);
  });
});

describe("Kyron tool catalog", () => {
  const tool = (name: string, readOnly: boolean): KyronMcpToolSummary => ({
    name,
    title: null,
    description: `${name} description`,
    inputSchema: {},
    outputSchema: null,
    annotations: { readOnlyHint: readOnly },
    explorerAllowed: readOnly,
    qaUse: qaUseFor(name),
  });
  const tools = [
    tool("get_lesson_activity", true),
    tool("update_lesson_activity", false),
    tool("get_lesson_segment_transcript", true),
    tool("publish_lesson_collection", false),
    tool("list_comment_threads", true),
    tool("list_organization_avatars", true),
    tool("get_lesson_instance_transcript", true),
    tool("regenerate_all_lesson_videos", false),
    tool("transcribe_audio", false),
  ];

  it("groups tools by area and labels how QA uses them", () => {
    expect(groupKyronTools(tools).map((group) => [group.label, group.tools.map((item) => item.name)])).toEqual([
      ["Learner activity", ["get_lesson_instance_transcript"]],
      ["Review comments", ["list_comment_threads"]],
      ["Courses and drafts", ["publish_lesson_collection"]],
      ["Look and feel", ["list_organization_avatars"]],
      ["Lesson content", ["get_lesson_activity", "update_lesson_activity", "get_lesson_segment_transcript", "regenerate_all_lesson_videos"]],
      ["Other", ["transcribe_audio"]],
    ]);
    expect(tools.map((item) => item.qaUse)).toEqual(["reads", "writes", "forbidden", null, null, null, null, "renders", null]);
  });

  it("filters by search text and QA use", () => {
    expect(filterKyronTools(tools, { query: "COMMENT", usedByQa: false }).map((item) => item.name)).toEqual(["list_comment_threads"]);
    expect(filterKyronTools(tools, { query: "", usedByQa: true })).toHaveLength(4);
  });
});

function version(versionNumber: number, kind: KyronRevisionVersion["kind"], key: string, after: string): KyronRevisionVersion {
  return {
    id: `v${versionNumber}`,
    versionNumber,
    kind,
    author: "QA revision agent",
    model: null,
    summary: "",
    runId: null,
    createdAt: "2026-11-02T18:00:00.000Z",
    changes: [{ key, location: "", before: "wrong", after, rationale: "", findings: [], appliedInVersion: null }],
  };
}
