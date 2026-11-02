import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type {
  QaActivity,
  QaActivityType,
  QaLessonContent,
  QaLessonSnapshot,
  QaMissingField,
  QaQuestion,
} from "@/types/api";

import type { LessonPacket } from "./types";

const ACTIVITY_TYPES: readonly QaActivityType[] = [
  "instruction",
  "question",
  "conversation",
  "scenario",
  "reflection",
  "other",
];
const MAX_ACTIVITIES = 200;
export const MAX_FIELD_LENGTH = 20_000;
const MAX_REFERENCES = 20;
const MAX_REFERENCE_LENGTH = 200_000;

// Field paths a patch may target, relative to one activity.
export const PATCHABLE_ACTIVITY_FIELDS = [
  "narration",
  "onScreenText",
  "tutorGuidance",
  "question.prompt",
  "question.rationale",
  "question.answerKey",
] as const;

// Lesson-level fields a fix may target when the source can write them.
export const LESSON_FIELD_PATHS = ["lesson.title", "lesson.audience", "lesson.objective"] as const;

const SCENE_FIELD = /^scenes\.([^.]+)\.(narration|title|onScreenText)$/;
const TERM_FIELD = /^vocabulary\.([^.]+)\.(term|definition)$/;

// Answer keys and lesson-level settings redefine the lesson, so changes to
// them always need a person's approval.
export function isProtectedField(fieldPath: string): boolean {
  return fieldPath === "question.answerKey" || fieldPath.startsWith("lesson.");
}

// Every field of an activity a fix may target: the standard text fields that
// have a value, each scene's text and each vocabulary term, minus the fields
// the source derives itself.
export function activityFieldPaths(activity: QaActivity): string[] {
  const readOnly = new Set(activity.readOnlyFields ?? []);
  const paths = [
    ...PATCHABLE_ACTIVITY_FIELDS.filter((fieldPath) => readActivityField(activity, fieldPath) !== null),
    ...(activity.scenes ?? []).flatMap((scene) =>
      (["narration", "title", "onScreenText"] as const)
        .filter((field) => scene[field] !== null)
        .map((field) => `scenes.${scene.id}.${field}`),
    ),
    ...(activity.terms ?? []).flatMap((term) => [`vocabulary.${term.id}.term`, `vocabulary.${term.id}.definition`]),
  ];

  return paths.filter((fieldPath) => !readOnly.has(fieldPath));
}

export function readLessonField(lesson: QaLessonContent, fieldPath: string): string | null {
  switch (fieldPath) {
    case "lesson.title":
      return lesson.title || null;
    case "lesson.audience":
      return lesson.audience;
    case "lesson.objective":
      return lesson.learningObjectives[0] ?? null;
    default:
      return null;
  }
}

export function writeLessonField(lesson: QaLessonContent, fieldPath: string, value: string): QaLessonContent {
  switch (fieldPath) {
    case "lesson.title":
      return { ...lesson, title: value };
    case "lesson.audience":
      return { ...lesson, audience: value };
    case "lesson.objective":
      return { ...lesson, learningObjectives: [value, ...lesson.learningObjectives.slice(1)] };
    default:
      throw new Error(`Unsupported lesson field "${fieldPath}".`);
  }
}

export type PacketParseResult =
  | { ok: true; packet: LessonPacket }
  | { ok: false; errors: string[] };

export function parseLessonPacket(value: unknown): PacketParseResult {
  const errors: string[] = [];
  const root = asRecord(value);

  if (!root) {
    return { ok: false, errors: ["The packet must be a JSON object."] };
  }

  const lessonRecord = asRecord(root.lesson);
  const title = readText(lessonRecord?.title, "lesson.title", errors, true);
  const activitiesValue = root.activities;

  if (!Array.isArray(activitiesValue) || activitiesValue.length === 0) {
    errors.push("activities must be a non-empty array.");
  } else if (activitiesValue.length > MAX_ACTIVITIES) {
    errors.push(`A lesson can have at most ${MAX_ACTIVITIES} activities.`);
  }

  const activities = Array.isArray(activitiesValue)
    ? activitiesValue
        .slice(0, MAX_ACTIVITIES)
        .map((activity, index) => parseActivity(activity, index, errors))
    : [];
  const duplicateId = findDuplicate(activities.map((activity) => activity.id));

  if (duplicateId) {
    errors.push(`Activity id "${duplicateId}" is used more than once.`);
  }

  const references = parseReferences(root.references, errors);

  if (errors.length > 0 || !title) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    packet: {
      lesson: {
        title,
        description: readText(lessonRecord?.description, "lesson.description", errors),
        audience: readText(lessonRecord?.audience, "lesson.audience", errors),
        learningObjectives: readTextList(
          lessonRecord?.learningObjectives,
          "lesson.learningObjectives",
          errors,
        ),
        durationSeconds:
          typeof lessonRecord?.durationSeconds === "number" &&
          lessonRecord.durationSeconds > 0
            ? Math.round(lessonRecord.durationSeconds)
            : null,
        assetType: readText(lessonRecord?.assetType, "lesson.assetType", errors),
      },
      activities,
      references,
    },
  };
}

export function buildSnapshot({
  createdBy,
  lessonId,
  packet,
  source,
}: {
  createdBy: string;
  lessonId: string;
  packet: LessonPacket;
  source: QaLessonSnapshot["source"];
}): QaLessonSnapshot {
  return {
    id: randomUUID(),
    lessonId,
    source,
    contentHash: hashPacket(packet),
    createdAt: new Date().toISOString(),
    createdBy,
    lesson: packet.lesson,
    activities: packet.activities,
    references: packet.references,
    missingFields: findMissingFields(packet),
  };
}

export function hashPacket(packet: LessonPacket): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lesson: packet.lesson,
        activities: packet.activities,
        references: packet.references,
      }),
    )
    .digest("hex");
}

export function readActivityField(
  activity: QaActivity,
  fieldPath: string,
): string | null {
  const scene = SCENE_FIELD.exec(fieldPath);
  const term = TERM_FIELD.exec(fieldPath);

  if (scene) {
    const match = (activity.scenes ?? []).find((candidate) => candidate.id === scene[1]);

    return match ? match[scene[2] as "narration" | "title" | "onScreenText"] : null;
  }

  if (term) {
    const match = (activity.terms ?? []).find((candidate) => candidate.id === term[1]);

    return match ? match[term[2] as "term" | "definition"] : null;
  }

  switch (fieldPath) {
    case "narration":
      return activity.narration;
    case "onScreenText":
      return activity.onScreenText;
    case "tutorGuidance":
      return activity.tutorGuidance;
    case "question.prompt":
      return activity.question?.prompt ?? null;
    case "question.rationale":
      return activity.question?.rationale ?? null;
    case "question.answerKey":
      return activity.question ? activity.question.answerKey.join(", ") : null;
    default:
      return null;
  }
}

export function writeActivityField(
  activity: QaActivity,
  fieldPath: string,
  value: string,
): QaActivity {
  const scene = SCENE_FIELD.exec(fieldPath);
  const term = TERM_FIELD.exec(fieldPath);

  if (scene || term) {
    const previous = readActivityField(activity, fieldPath);
    const field = (scene ?? term)?.[2] as string;
    const id = (scene ?? term)?.[1];

    // The joined text the checks read follows the edited part.
    return {
      ...activity,
      narration: replaceOnce(activity.narration, previous, value),
      onScreenText: replaceOnce(activity.onScreenText, previous, value),
      scenes: (activity.scenes ?? []).map((item) => (scene && item.id === id ? { ...item, [field]: value } : item)),
      terms: (activity.terms ?? []).map((item) => (term && item.id === id ? { ...item, [field]: value } : item)),
    };
  }

  switch (fieldPath) {
    case "narration":
      return { ...activity, narration: value };
    case "onScreenText":
      return { ...activity, onScreenText: value };
    case "tutorGuidance":
      return { ...activity, tutorGuidance: value };
    case "question.prompt":
    case "question.rationale":
    case "question.answerKey":
      return activity.question
        ? { ...activity, question: writeQuestionField(activity.question, fieldPath, value) }
        : activity;
    default:
      throw new Error(`Unsupported field path "${fieldPath}".`);
  }
}

// Replaces text only when it appears exactly once, so an ambiguous edit never
// changes the wrong passage.
export function replaceOnce(text: string | null, previous: string | null, next: string): string | null {
  if (!text || !previous) {
    return text;
  }

  const index = text.indexOf(previous);

  return index >= 0 && text.indexOf(previous, index + 1) < 0
    ? text.slice(0, index) + next + text.slice(index + previous.length)
    : text;
}

function writeQuestionField(
  question: QaQuestion,
  fieldPath: string,
  value: string,
): QaQuestion {
  if (fieldPath === "question.prompt") {
    return { ...question, prompt: value };
  }

  if (fieldPath === "question.rationale") {
    return { ...question, rationale: value };
  }

  return {
    ...question,
    answerKey: value
      .split(",")
      .map((answer) => answer.trim())
      .filter(Boolean),
  };
}

function findMissingFields(packet: LessonPacket): QaMissingField[] {
  const missing: QaMissingField[] = [];

  if (packet.lesson.learningObjectives.length === 0) {
    missing.push({ activityId: null, field: "lesson.learningObjectives" });
  }

  if (!packet.lesson.audience) {
    missing.push({ activityId: null, field: "lesson.audience" });
  }

  for (const activity of packet.activities) {
    if (activity.type === "question") {
      if (!activity.question) {
        missing.push({ activityId: activity.id, field: "question" });
      } else if (activity.question.answerKey.length === 0) {
        missing.push({ activityId: activity.id, field: "question.answerKey" });
      }
    } else if (!activity.narration && !activity.onScreenText) {
      missing.push({ activityId: activity.id, field: "narration" });
    }

    if (
      (activity.type === "conversation" || activity.type === "scenario") &&
      !activity.tutorGuidance
    ) {
      missing.push({ activityId: activity.id, field: "tutorGuidance" });
    }
  }

  return missing;
}

function parseActivity(value: unknown, index: number, errors: string[]): QaActivity {
  const record = asRecord(value) ?? {};
  const label = `activities[${index}]`;
  const id =
    typeof record.id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(record.id)
      ? record.id
      : `activity-${index + 1}`;
  const type = ACTIVITY_TYPES.includes(record.type as QaActivityType)
    ? (record.type as QaActivityType)
    : record.question
      ? "question"
      : "instruction";

  if (record.type !== undefined && !ACTIVITY_TYPES.includes(record.type as QaActivityType)) {
    errors.push(`${label}.type must be one of: ${ACTIVITY_TYPES.join(", ")}.`);
  }

  return {
    id,
    title: readText(record.title, `${label}.title`, errors),
    type,
    narration: readText(record.narration, `${label}.narration`, errors),
    onScreenText: readText(record.onScreenText, `${label}.onScreenText`, errors),
    question: parseQuestion(record.question, `${label}.question`, errors),
    tutorGuidance: readText(record.tutorGuidance, `${label}.tutorGuidance`, errors),
    media: parseMedia(record.media),
  };
}

function parseQuestion(value: unknown, label: string, errors: string[]): QaQuestion | null {
  if (value === undefined || value === null) {
    return null;
  }

  const record = asRecord(value);

  if (!record) {
    errors.push(`${label} must be an object.`);
    return null;
  }

  const prompt = readText(record.prompt, `${label}.prompt`, errors, true) ?? "";
  const options = Array.isArray(record.options)
    ? record.options.map((option, index) => {
        const optionRecord = asRecord(option) ?? {};

        return {
          id:
            typeof optionRecord.id === "string" && optionRecord.id.trim()
              ? optionRecord.id.trim()
              : String.fromCharCode(65 + index),
          text: readText(optionRecord.text, `${label}.options[${index}].text`, errors) ?? "",
        };
      })
    : [];
  const answerKey = Array.isArray(record.answerKey)
    ? record.answerKey.filter((answer): answer is string => typeof answer === "string")
    : typeof record.answerKey === "string" && record.answerKey.trim()
      ? [record.answerKey.trim()]
      : [];

  return {
    prompt,
    options,
    answerKey,
    rationale: readText(record.rationale, `${label}.rationale`, errors),
  };
}

function parseMedia(value: unknown): QaActivity["media"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 20).map((item) => {
    const record = asRecord(item) ?? {};
    const kind = ["video", "image", "audio"].includes(record.kind as string)
      ? (record.kind as "video" | "image" | "audio")
      : "other";

    return {
      kind,
      description: typeof record.description === "string" ? record.description : null,
      url: typeof record.url === "string" ? record.url : null,
    };
  });
}

function parseReferences(value: unknown, errors: string[]): LessonPacket["references"] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_REFERENCES) {
    errors.push(`references must be an array of at most ${MAX_REFERENCES} items.`);
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item) ?? {};
    const text =
      typeof record.text === "string" && record.text.trim()
        ? record.text.slice(0, MAX_REFERENCE_LENGTH)
        : null;

    if (!text) {
      errors.push(`references[${index}].text is required.`);
      return [];
    }

    return [
      {
        title:
          typeof record.title === "string" && record.title.trim()
            ? record.title.trim().slice(0, 200)
            : `Reference ${index + 1}`,
        text,
      },
    ];
  });
}

function readText(
  value: unknown,
  label: string,
  errors: string[],
  required = false,
): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) {
      errors.push(`${label} is required.`);
    }

    return null;
  }

  if (typeof value !== "string") {
    errors.push(`${label} must be text.`);
    return null;
  }

  if (value.length > MAX_FIELD_LENGTH) {
    errors.push(`${label} must be ${MAX_FIELD_LENGTH.toLocaleString()} characters or fewer.`);
    return null;
  }

  return value.trim() || null;
}

function readTextList(value: unknown, label: string, errors: string[]): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list of text.`);
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, MAX_FIELD_LENGTH));
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
