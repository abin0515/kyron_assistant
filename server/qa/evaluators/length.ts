import "server-only";

import {
  ASSET_KIND_LABELS,
  assetKindFor,
  categoryForMinutes,
  formatMinutes,
  LENGTH_ESTIMATE,
  LENGTH_LEVEL_LABELS,
  LENGTH_TARGET_MINUTES,
  levelForDuration,
  needsLengthReview,
  speechMinutes,
} from "@/lib/length-targets";
import type {
  AssetKind,
  LengthLevel,
  QaActivity,
  QaAssetLength,
  QaLengthReport,
  QaLessonSnapshot,
} from "@/types/api";

import type { CheckDraft, EvaluationInput, EvaluationOutput, FindingDraft } from "./types";

const CRITERIA: Record<AssetKind, string> = {
  video: "length.video-fit",
  activity: "length.activity-fit",
  practice: "length.practice-fit",
};

// A measured group: one topic's video, one activity, or one topic's practice.
type Measured = {
  kind: AssetKind;
  activityId: string;
  label: string;
  minutes: number;
};

// Exact length checks against the Brief / Normal / Detailed targets. Videos
// and practice are measured per topic (a topic's video assets play back to
// back; its practice activities form its quiz); activities one by one. A
// misfit is flagged for a person and never fixed automatically: QA cannot
// sensibly add or remove whole activities.
export async function evaluateLength({ snapshot }: EvaluationInput): Promise<EvaluationOutput> {
  const lengths = measureLengths(snapshot);
  const level = lengths.level;

  if (!level) {
    return {
      checks: (Object.keys(CRITERIA) as AssetKind[]).map((kind) =>
        check(kind, null, "not_applicable", "The lesson has no length level to check against."),
      ),
      findings: [],
      usage: [],
      lengths,
    };
  }

  const groups = measuredGroups(snapshot, lengths);
  const checks: CheckDraft[] = [];
  const findings: FindingDraft[] = [];

  for (const kind of Object.keys(CRITERIA) as AssetKind[]) {
    const ofKind = groups.filter((group) => group.kind === kind);

    if (ofKind.length === 0) {
      checks.push(check(kind, null, "not_applicable", `This lesson has no ${ASSET_KIND_LABELS[kind].toLowerCase()} assets.`));
      continue;
    }

    for (const group of ofKind) {
      const target = LENGTH_TARGET_MINUTES[kind][level];
      const flagged = needsLengthReview(kind, level, group.minutes);
      const summary = `${group.label}: about ${formatMinutes(group.minutes)} (estimated); the ${LENGTH_LEVEL_LABELS[level]} target is ${target} min.`;

      checks.push(check(kind, group.activityId, flagged ? "needs_review" : "pass", summary));

      if (flagged) {
        findings.push(lengthFinding(group, level, target));
      }
    }
  }

  return { checks, findings, usage: [], lengths };
}

// Per-asset estimates and per-topic video totals, before any video is
// rendered: narration at a speaking rate, plus allowances for conversation
// turns and questions.
export function measureLengths(snapshot: Pick<QaLessonSnapshot, "lesson" | "activities">): QaLengthReport {
  const assets: QaAssetLength[] = snapshot.activities.flatMap((activity) => {
    const kind = assetKindFor(activity);

    return kind
      ? [{
          activityId: activity.id,
          title: activity.title,
          sectionId: activity.sectionId ?? null,
          kind,
          minutes: round(estimateMinutes(kind, activity)),
          method: kind === "video" ? "narration_estimate" : kind === "activity" ? "activity_estimate" : "question_estimate",
        } satisfies QaAssetLength]
      : [];
  });
  const sections = snapshot.lesson.sections ?? [];
  const topicVideos = topicGroups(assets.filter((asset) => asset.kind === "video")).map(({ items, sectionId }) => {
    const minutes = round(items.reduce((total, asset) => total + asset.minutes, 0));

    return {
      sectionId,
      topic: sections.find((section) => section.id === sectionId)?.topic ?? null,
      minutes,
      category: categoryForMinutes("video", minutes),
    };
  });

  return { level: levelForDuration(snapshot.lesson.durationSeconds), assets, topicVideos };
}

function estimateMinutes(kind: AssetKind, activity: QaActivity): number {
  const narration = (activity.scenes ?? [])
    .filter((scene) => (kind === "video" ? scene.part === "lecture_video" : true))
    .map((scene) => scene.narration ?? "")
    .join(" ");
  const spoken = speechMinutes(narration || (kind === "video" ? activity.narration : activity.question?.prompt));

  const conversation = spoken + (activity.learnerTurns ?? LENGTH_ESTIMATE.defaultTurns) * LENGTH_ESTIMATE.minutesPerTurn;

  switch (kind) {
    case "video":
      return spoken;
    case "activity":
      return conversation;
    case "practice":
      // A practice conversation runs turn by turn; a multiple-choice item is one question.
      return activity.kyronType?.endsWith("conversation") ? conversation : spoken + LENGTH_ESTIMATE.minutesPerQuestion;
  }
}

function measuredGroups(snapshot: Pick<QaLessonSnapshot, "lesson">, lengths: QaLengthReport): Measured[] {
  const sections = snapshot.lesson.sections ?? [];
  const topicName = (sectionId: string | null) =>
    sections.find((section) => section.id === sectionId)?.topic ?? (sectionId ? `Topic ${sectionId}` : "The lesson");
  const perTopic = (kind: "video" | "practice", noun: string) =>
    topicGroups(lengths.assets.filter((asset) => asset.kind === kind)).map(({ items, sectionId }) => ({
      kind,
      activityId: items[0].activityId,
      label: `${topicName(sectionId)} ${noun}`,
      minutes: items.reduce((total, asset) => total + asset.minutes, 0),
    }));

  return [
    ...perTopic("video", "video"),
    ...lengths.assets
      .filter((asset) => asset.kind === "activity")
      .map((asset) => ({ kind: "activity" as const, activityId: asset.activityId, label: asset.title ?? "Activity", minutes: asset.minutes })),
    ...perTopic("practice", "practice"),
  ];
}

function topicGroups(assets: QaAssetLength[]): Array<{ sectionId: string | null; items: QaAssetLength[] }> {
  const groups = new Map<string | null, QaAssetLength[]>();

  for (const asset of assets) {
    groups.set(asset.sectionId, [...(groups.get(asset.sectionId) ?? []), asset]);
  }

  return [...groups].map(([sectionId, items]) => ({ sectionId, items }));
}

function lengthFinding(group: Measured, level: LengthLevel, target: number): FindingDraft {
  const direction = group.minutes < target ? "shorter" : "longer";

  return {
    criterionId: CRITERIA[group.kind],
    evaluator: "length",
    activityId: group.activityId,
    fieldPath: null,
    // Reported for a person; length is not something QA changes on its own.
    severity: "minor",
    observedText: `About ${formatMinutes(group.minutes)}`,
    expectedBehavior: `${ASSET_KIND_LABELS[group.kind]} close to ${target} min (${LENGTH_LEVEL_LABELS[level]}).`,
    rationale: `${group.label} is about ${formatMinutes(group.minutes)}, ${direction} than the ${LENGTH_LEVEL_LABELS[level]} target of ${target} min (closer to another level's target). Check whether the lesson covers the right amount for this length, or choose another length level.`,
    evidence: [
      {
        kind: "rule",
        label: "Length estimate",
        quote: `Estimated from narration at ${LENGTH_ESTIMATE.wordsPerMinute} words per minute${group.kind === "video" ? "" : `, plus ${LENGTH_ESTIMATE.minutesPerTurn} minutes per learner turn or ${LENGTH_ESTIMATE.minutesPerQuestion} minute per question`}.`,
      },
    ],
    retest: "Re-check after the lesson or its length level changes.",
  };
}

function check(kind: AssetKind, activityId: string | null, status: CheckDraft["status"], summary: string): CheckDraft {
  return { criterionId: CRITERIA[kind], evaluator: "length", activityId, status, summary };
}

function round(minutes: number): number {
  return Math.round(minutes * 10) / 10;
}
