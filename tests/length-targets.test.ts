import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assetKindFor,
  categoryForMinutes,
  durationForLevel,
  formatMinutes,
  LENGTH_TARGET_MINUTES,
  levelForDuration,
  levelTargetsSummary,
  needsLengthReview,
  speechMinutes,
} from "@/lib/length-targets";
import { evaluateLength, measureLengths } from "@/server/qa/evaluators/length";
import type { QaActivity, QaLessonSnapshot, QaRubricPack } from "@/types/api";

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

function activity(overrides: Partial<QaActivity> & Pick<QaActivity, "id">): QaActivity {
  return {
    title: overrides.id,
    type: "instruction",
    narration: null,
    onScreenText: null,
    question: null,
    tutorGuidance: null,
    media: [],
    ...overrides,
  };
}

// One topic: an introduction and a lecture (5 min of narration at 150 wpm),
// a reflection conversation, and one multiple-choice practice question.
function snapshot(durationSeconds: number | null): QaLessonSnapshot {
  return {
    id: "snap",
    lessonId: "lesson",
    source: "kyron_mcp",
    contentHash: "hash",
    createdAt: "2026-11-11T00:00:00.000Z",
    createdBy: "QA agent",
    lesson: {
      title: "PDEs",
      description: null,
      audience: null,
      learningObjectives: ["Classify PDEs by order and linearity."],
      durationSeconds,
      assetType: "one_shot_course",
      sections: [{ id: "64011", topic: "PDE Order and Linearity", objectives: ["Classify PDEs."] }],
    },
    activities: [
      activity({
        id: "504101",
        kyronType: "introduction",
        sectionId: "64011",
        scenes: [{ id: "s1", part: "lecture_video", title: "Intro", onScreenText: null, narration: words(150), hasVideo: false }],
      }),
      activity({
        id: "504103",
        kyronType: "lecture",
        sectionId: "64011",
        scenes: [{ id: "s2", part: "lecture_video", title: "Order", onScreenText: null, narration: words(600), hasVideo: false }],
      }),
      activity({
        id: "504102",
        type: "reflection",
        kyronType: "reflection_conversation",
        sectionId: "64011",
        question: { prompt: words(30), options: [], answerKey: [], rationale: null },
        scenes: [{ id: "s3", part: "question_video", title: null, onScreenText: null, narration: words(30), hasVideo: false }],
      }),
      activity({
        id: "504108",
        type: "question",
        kyronType: "multiple_choice_learning",
        sectionId: "64011",
        question: {
          prompt: "Which is linear?",
          options: [{ id: "a", text: "u_t = u_xx" }, { id: "b", text: "u_t = u u_x" }],
          answerKey: ["a"],
          rationale: null,
        },
      }),
      activity({ id: "vocabulary", type: "other", title: "Vocabulary" }),
    ],
    references: [],
    missingFields: [],
  };
}

describe("length targets", () => {
  it("holds the agreed minutes and maps levels onto Kyron lesson lengths", () => {
    expect(LENGTH_TARGET_MINUTES).toEqual({
      video: { brief: 1, normal: 5, detailed: 15 },
      activity: { brief: 3, normal: 8, detailed: 20 },
      practice: { brief: 5, normal: 10, detailed: 30 },
    });
    expect([durationForLevel("brief"), durationForLevel("normal"), durationForLevel("detailed")]).toEqual([480, 900, 1800]);
    expect([480, 900, 1800, 3600, null].map(levelForDuration)).toEqual(["brief", "normal", "detailed", "detailed", null]);
    expect(levelTargetsSummary("normal")).toBe("Video 5 min per topic · Activity 8 min · Practice / quiz 10 min");
  });

  it("classifies assets by their Kyron activity type", () => {
    const cases: Array<[Partial<QaActivity>, string | null]> = [
      [{ kyronType: "lecture" }, "video"],
      [{ kyronType: "conclusion" }, "video"],
      [{ kyronType: "clarifying_conversation", type: "conversation" }, "activity"],
      [{ kyronType: "multiple_choice_assessment", type: "question" }, "practice"],
      [{ kyronType: "assessment_conversation", type: "conversation" }, "practice"],
      [{ type: "question" }, "practice"],
      [{ id: "vocabulary", type: "other" }, null],
    ];

    for (const [overrides, kind] of cases) {
      expect(assetKindFor(activity({ id: "x", ...overrides }))).toBe(kind);
    }
  });

  it("categorizes lengths by the nearest target and flags large misfits", () => {
    expect(speechMinutes(words(300))).toBe(2);
    expect([0.5, 2, 3, 8, 9, 40].map((minutes) => categoryForMinutes("video", minutes))).toEqual([
      "brief", "brief", "normal", "normal", "detailed", "detailed",
    ]);
    // Flagged exactly when the category differs from the chosen level.
    expect(needsLengthReview("video", "normal", 2)).toBe(true);
    expect(needsLengthReview("video", "normal", 2.4)).toBe(false);
    expect(needsLengthReview("video", "normal", 5)).toBe(false);
    expect(needsLengthReview("video", "normal", 9)).toBe(true);
    expect(needsLengthReview("video", "brief", 2.1)).toBe(false);
    expect([0.5, 4.86, 15].map(formatMinutes)).toEqual(["30 sec", "4.9 min", "15 min"]);
  });
});

describe("QA length check", () => {
  const rubric = {} as QaRubricPack;

  it("measures each asset and each topic's video, skipping the vocabulary", () => {
    const lengths = measureLengths(snapshot(900));

    expect(lengths.level).toBe("normal");
    expect(lengths.assets.map((asset) => [asset.activityId, asset.kind, asset.minutes])).toEqual([
      ["504101", "video", 1],
      ["504103", "video", 4],
      ["504102", "activity", 6.2],
      ["504108", "practice", 1],
    ]);
    expect(lengths.topicVideos).toEqual([
      { sectionId: "64011", topic: "PDE Order and Linearity", minutes: 5, category: "normal" },
    ]);
  });

  it("passes fitting assets and flags misfits for a person, never blocking or fixing", async () => {
    const output = await evaluateLength({ snapshot: snapshot(900), rubric, activityIds: null });
    const status = (criterionId: string) =>
      output.checks.filter((check) => check.criterionId === criterionId).map((check) => check.status);

    expect(status("length.video-fit")).toEqual(["pass"]);
    expect(status("length.activity-fit")).toEqual(["pass"]);
    // One 1-minute question against a 10-minute practice target.
    expect(status("length.practice-fit")).toEqual(["needs_review"]);
    expect(output.findings).toHaveLength(1);
    expect(output.findings[0]).toMatchObject({
      criterionId: "length.practice-fit",
      severity: "minor",
      fieldPath: null,
      activityId: "504108",
    });
    expect(output.findings[0].proposedPatch).toBeUndefined();
    expect(output.lengths?.topicVideos[0].category).toBe("normal");
  });

  it("estimates conversations from their question bank", () => {
    const base = snapshot(900);
    const withBank = {
      ...base,
      activities: base.activities.map((item) => (item.id === "504102" ? { ...item, learnerTurns: 4 } : item)),
    };

    expect(measureLengths(withBank).assets.find((asset) => asset.activityId === "504102")?.minutes).toBe(8.2);
  });

  it("checks against the chosen level, and has nothing to check without one", async () => {
    const detailed = await evaluateLength({ snapshot: snapshot(1800), rubric, activityIds: null });

    expect(detailed.checks.find((check) => check.criterionId === "length.video-fit")?.status).toBe("needs_review");

    const none = await evaluateLength({ snapshot: snapshot(null), rubric, activityIds: null });

    expect(none.checks.every((check) => check.status === "not_applicable")).toBe(true);
    expect(none.findings).toEqual([]);
  });
});
