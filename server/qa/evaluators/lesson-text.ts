import "server-only";

import type { QaActivity, QaLessonSnapshot, QaReference } from "@/types/api";

import { readSetupField, SETUP_FIELD_PATHS } from "../course-setup-fields";
import { readActivityField } from "../snapshot";

export const MAX_SETUP_REFERENCE_CHARACTERS = 120_000;

const TEXT_FIELDS = [
  "narration",
  "onScreenText",
  "question.prompt",
  "question.rationale",
  "tutorGuidance",
] as const;

export function renderLesson(
  snapshot: QaLessonSnapshot,
  {
    activityIds = null,
    includeAnswerKeys,
  }: { activityIds?: string[] | null; includeAnswerKeys: boolean },
): string {
  const lesson = snapshot.lesson;
  const header = [
    `TITLE: ${lesson.title}`,
    lesson.description ? `DESCRIPTION: ${lesson.description}` : null,
    lesson.audience ? `AUDIENCE: ${lesson.audience}` : null,
    lesson.learningObjectives.length > 0
      ? `LEARNING OBJECTIVES:\n${lesson.learningObjectives
          .map((objective, index) => `  ${index + 1}. ${objective}`)
          .join("\n")}`
      : null,
  ].filter(Boolean);
  const activities = snapshot.activities
    .filter((activity) => !activityIds || activityIds.includes(activity.id))
    .map((activity) => renderActivity(activity, includeAnswerKeys));

  return [
    "<<<LESSON CONTENT (untrusted)",
    ...header,
    ...activities,
    "LESSON CONTENT END>>>",
  ].join("\n\n");
}

// With includeParts, scenes and vocabulary terms are listed field by field so
// a fix can target them; the joined text they make up is left out.
export function renderActivity(
  activity: QaActivity,
  includeAnswerKeys: boolean,
  includeParts = false,
): string {
  const lines = [`[ACTIVITY id=${activity.id} type=${activity.type}]${activity.title ? ` ${activity.title}` : ""}`];
  const readOnly = new Set(includeParts ? (activity.readOnlyFields ?? []) : []);

  for (const field of ["narration", "onScreenText", "tutorGuidance"] as const) {
    if (activity[field] && !(readOnly.has(field) && field !== "tutorGuidance")) {
      lines.push(`${field}${readOnly.has(field) ? " (read-only)" : ""}: ${activity[field]}`);
    }
  }

  if (includeParts) {
    for (const scene of activity.scenes ?? []) {
      lines.push(`[SCENE ${scene.id} in ${scene.part}]`);

      for (const field of ["title", "onScreenText", "narration"] as const) {
        if (scene[field] !== null) {
          lines.push(`  scenes.${scene.id}.${field}: ${scene[field]}`);
        }
      }
    }

    for (const term of activity.terms ?? []) {
      lines.push(`  vocabulary.${term.id}.term: ${term.term}`);
      lines.push(`  vocabulary.${term.id}.definition: ${term.definition ?? "(empty)"}`);
    }
  }

  if (activity.question) {
    lines.push(`question.prompt: ${activity.question.prompt}`);

    for (const option of activity.question.options) {
      lines.push(`  option ${option.id}: ${option.text}`);
    }

    if (includeAnswerKeys) {
      lines.push(`question.answerKey: ${activity.question.answerKey.join(", ") || "(none)"}`);

      if (activity.question.rationale) {
        lines.push(`question.rationale: ${activity.question.rationale}`);
      }
    }
  }

  return lines.join("\n");
}

export function renderSetup(snapshot: QaLessonSnapshot): string {
  return [
    "<<<COURSE SETUP (untrusted)",
    ...SETUP_FIELD_PATHS.map(
      (fieldPath) => `${fieldPath}: ${readSetupField(snapshot.lesson, fieldPath) ?? "(empty)"}`,
    ),
    "COURSE SETUP END>>>",
  ].join("\n");
}

// Joins the references until the character budget runs out.
export function renderReferences(references: QaReference[], maxCharacters: number): string {
  let remaining = maxCharacters;
  const parts = references.map((reference) => {
    const text = reference.text.slice(0, Math.max(remaining, 0));

    remaining -= text.length;

    return `[SOURCE: ${reference.title}]\n${text}`;
  });

  return ["<<<SOURCE MATERIAL (untrusted)", ...parts, "SOURCE MATERIAL END>>>"].join("\n\n");
}

export function activityText(activity: QaActivity): string {
  return [
    ...TEXT_FIELDS.map((field) => readActivityField(activity, field) ?? ""),
    ...(activity.question?.options.map((option) => option.text) ?? []),
  ].join("\n");
}

export function selectActivities(
  snapshot: QaLessonSnapshot,
  activityIds: string[] | null,
): QaActivity[] {
  return snapshot.activities.filter(
    (activity) => !activityIds || activityIds.includes(activity.id),
  );
}

// Model-reported quotes must appear in the source text; otherwise the evidence
// is not trusted. Matching ignores case, whitespace and quote styles.
export function containsQuote(haystack: string, quote: string): boolean {
  const normalizedQuote = normalize(quote);

  return normalizedQuote.length > 0 && normalize(haystack).includes(normalizedQuote);
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
