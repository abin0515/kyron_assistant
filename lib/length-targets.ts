import type { AssetKind, Duration, LengthLevel, QaActivity } from "@/types/api";

// How long each kind of asset should be, in minutes, at each length level.
// Planning, the QA length check and the module report all read these.
export const LENGTH_TARGET_MINUTES: Record<AssetKind, Record<LengthLevel, number>> = {
  video: { brief: 1, normal: 5, detailed: 15 },
  activity: { brief: 3, normal: 8, detailed: 20 },
  practice: { brief: 5, normal: 10, detailed: 30 },
};

export const LENGTH_LEVEL_LABELS: Record<LengthLevel, string> = {
  brief: "Brief",
  normal: "Normal",
  detailed: "Detailed",
};

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  video: "Video",
  activity: "Activity",
  practice: "Practice / quiz",
};

// Kyron accepts only a total lesson length of 480, 900, 1800 or 3600 seconds.
// Calibrated on a generated draft: a 900-second Kyron lesson had a 4.9-minute
// topic video (Normal), so Brief asks for 480, Normal 900 and Detailed 1800.
// A 3600-second lesson also reads as Detailed.
export const LEVEL_DURATION_SECONDS: Record<LengthLevel, Duration> = {
  brief: 480,
  normal: 900,
  detailed: 1800,
};

// Assumptions for estimating length before a video is rendered.
export const LENGTH_ESTIMATE = {
  wordsPerMinute: 150,
  // A conversation: its prompt plus one learner turn per question-bank item
  // (this many when Kyron gives no question bank).
  defaultTurns: 3,
  minutesPerTurn: 2,
  minutesPerQuestion: 1,
} as const;

const VIDEO_TYPES = new Set(["introduction", "lecture", "conclusion"]);
const PRACTICE_TYPE = /multiple_choice|assessment|subset_of_finite/;

export function levelForDuration(seconds: number | null | undefined): LengthLevel | null {
  if (!seconds || seconds <= 0) {
    return null;
  }

  if (seconds <= LEVEL_DURATION_SECONDS.brief) {
    return "brief";
  }

  return seconds <= LEVEL_DURATION_SECONDS.normal ? "normal" : "detailed";
}

export function durationForLevel(level: LengthLevel): Duration {
  return LEVEL_DURATION_SECONDS[level];
}

// "Video 5 min per topic · Activity 8 min · Practice / quiz 10 min"
export function levelTargetsSummary(level: LengthLevel): string {
  return (Object.keys(LENGTH_TARGET_MINUTES) as AssetKind[])
    .map((kind) => `${ASSET_KIND_LABELS[kind]} ${LENGTH_TARGET_MINUTES[kind][level]} min${kind === "video" ? " per topic" : ""}`)
    .join(" · ");
}

// Which target an activity is measured against; null for the vocabulary list
// and anything else that is not a learner-facing asset.
export function assetKindFor(activity: Pick<QaActivity, "id" | "type" | "kyronType" | "question">): AssetKind | null {
  if (activity.id === "vocabulary") {
    return null;
  }

  if (activity.kyronType) {
    if (VIDEO_TYPES.has(activity.kyronType)) {
      return "video";
    }

    return PRACTICE_TYPE.test(activity.kyronType) ? "practice" : "activity";
  }

  switch (activity.type) {
    case "instruction":
      return "video";
    case "question":
      return "practice";
    case "conversation":
    case "reflection":
    case "scenario":
      return "activity";
    case "other":
      return null;
  }
}

export function speechMinutes(text: string | null | undefined): number {
  const words = (text ?? "").split(/\s+/).filter(Boolean).length;

  return words / LENGTH_ESTIMATE.wordsPerMinute;
}

// The level a measured length is closest to, with boundaries halfway between
// targets on a log scale (for video: below about 2.2 min is brief, above
// about 8.7 min is detailed).
export function categoryForMinutes(kind: AssetKind, minutes: number): LengthLevel {
  const targets = LENGTH_TARGET_MINUTES[kind];

  if (minutes < Math.sqrt(targets.brief * targets.normal)) {
    return "brief";
  }

  return minutes < Math.sqrt(targets.normal * targets.detailed) ? "normal" : "detailed";
}

// True when a length is closer to another level's target than to the chosen
// one, so the reported category and the flag always agree.
export function needsLengthReview(kind: AssetKind, level: LengthLevel, minutes: number): boolean {
  return categoryForMinutes(kind, minutes) !== level;
}

// "45 sec", "4.9 min", "15 min"
export function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return `${Math.max(1, Math.round(minutes * 60))} sec`;
  }

  return `${minutes < 10 ? minutes.toFixed(1).replace(/\.0$/, "") : Math.round(minutes)} min`;
}
