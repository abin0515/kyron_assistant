import "server-only";

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { withKyronReader } from "@/server/kyron-mcp/service";
import { asRecord, readString, readStrings } from "@/server/qa/evaluators/parsing";
import { mapKyronActivity, parseActivity, VOCABULARY_ACTIVITY_ID } from "@/server/qa/kyron-lesson";
import { fieldKey } from "@/server/qa/revision-agent";
import { activityFieldPaths } from "@/server/qa/snapshot";
import type {
  KyronContentActivity,
  KyronContentField,
  KyronContentScene,
  KyronContentSection,
  KyronDraftContentResponse,
  KyronFieldAccess,
} from "@/types/api";

const MAX_ACTIVITIES = 200;
const PAGE_SIZE = 100;
const VIDEO_PARTS = [
  "lecture_video",
  "question_video",
  "wait_video",
  "activity_question_video",
  "activity_wait_video",
  "analysis_wait_video",
] as const;
const TOOLS_CALLED = [
  "get_lesson_collection",
  "get_lesson",
  "get_lesson_lock_version",
  "list_lesson_sections",
  "list_lesson_activities",
  "get_lesson_activity",
  "list_vocabulary_items",
  "validate_lesson",
];
const URL_LIKE = /^(https?:|data:)/i;

// Everything the read-only tools return for one draft, before mapping.
export type KyronDraftRecords = {
  collection: unknown;
  lesson: unknown;
  lockVersion: unknown;
  sections: unknown;
  activities: unknown[];
  vocabulary: unknown;
  validation: unknown;
};

// Reads a draft through Kyron MCP for the admin view: read-only tools only.
export async function readKyronDraftContent(draftId: number): Promise<KyronDraftContentResponse> {
  const records = await withKyronReader(async (read) => {
    const collection = await read("get_lesson_collection", { id: draftId });
    const lessonId = readId(asRecord(asRecord(collection)?.draft_lesson)?.id);

    if (!lessonId) {
      throw invalid(`draft ${draftId} has no draft lesson`);
    }

    const sections = await read("list_lesson_sections", { lesson_id: lessonId, per_page: PAGE_SIZE });
    const activities: unknown[] = [];

    for (const section of sortedSections(sections)) {
      const listed = await read("list_lesson_activities", { lesson_id: lessonId, lesson_section_id: section.id });

      for (const id of listIds(listed).slice(0, MAX_ACTIVITIES - activities.length)) {
        activities.push(await read("get_lesson_activity", { id }));
      }
    }

    return {
      collection,
      lesson: await read("get_lesson", { id: lessonId }),
      lockVersion: await read("get_lesson_lock_version", { id: lessonId }),
      sections,
      activities,
      vocabulary: await read("list_vocabulary_items", { lesson_id: lessonId }),
      validation: await read("validate_lesson", { id: lessonId }),
    } satisfies KyronDraftRecords;
  }, "admin.view");

  return mapDraftContent(draftId, records, new Date().toISOString());
}

// Maps the raw records to the view. Only named fields are copied, so signed
// media links never reach the browser; they become true/false flags.
export function mapDraftContent(
  draftId: number,
  records: KyronDraftRecords,
  readAt: string,
): KyronDraftContentResponse {
  const collection = asRecord(records.collection) ?? {};
  const lesson = asRecord(records.lesson) ?? asRecord(collection.draft_lesson) ?? {};

  return {
    draftId,
    name: readString(collection, "name") ?? readString(lesson, "name") ?? `Kyron draft ${draftId}`,
    status: readString(asRecord(collection.lesson_collection_status) ?? {}, "status_type") ?? "unknown",
    lockVersion: Number(asRecord(records.lockVersion)?.lock_version ?? lesson.lock_version ?? 0),
    readAt,
    lessonFields: lessonFields(lesson),
    presentation: presentation(lesson),
    misconceptions: misconceptions(lesson),
    sections: sortedSections(records.sections).map(mapSection),
    activities: records.activities.map(mapActivity),
    vocabulary: vocabulary(records.vocabulary),
    publishCheck: publishCheck(records.validation),
    toolsCalled: TOOLS_CALLED,
  };
}

function lessonFields(lesson: Record<string, unknown>): KyronContentField[] {
  const minutes = typeof lesson.intended_time === "number" && lesson.intended_time > 0
    ? `${Math.round(lesson.intended_time / 60)} min`
    : null;

  return [
    lessonField("lesson.title", "Name", readString(lesson, "name")),
    readField("Description", readString(lesson, "description")),
    lessonField("lesson.audience", "Audience", readString(lesson, "audience")),
    lessonField("lesson.objective", "Objective", readString(lesson, "objective")),
    readField("Intended time", minutes),
    readField("Lesson type", label(readString(lesson, "lesson_type"))),
  ];
}

// Settings Kyron returns that the QA agent does not check.
function presentation(lesson: Record<string, unknown>): Array<{ label: string; value: string }> {
  const voice = asRecord(lesson.tts_voice) ?? {};
  const avatar = readString(lesson, "avatar_display_name");
  const items: Array<[string, string | null]> = [
    ["Avatar", avatar ? `${avatar}${lesson.avatar_visible === false ? " (hidden)" : ""}` : null],
    ["Voice", [readString(voice, "label"), readString(voice, "provider")].filter(Boolean).join(" · ") || null],
    ["Accent", readString(asRecord(lesson.tts_accent) ?? {}, "accent")],
    ["Slide template", label(readString(lesson, "slide_template"))],
    ["Primary color", readString(lesson, "primary_color")],
    ["Slide text color", readString(lesson, "slide_text_color")],
    ["Logo on scenes", yesNo(lesson.should_scenes_show_logo)],
    ["Subtitle languages", readStrings(lesson, "subtitle_languages").join(", ") || null],
    ["Language", readString(lesson, "locale")],
    ["Grading", label(readString(lesson, "grading_scheme"))],
    ["Question attempts", typeof lesson.question_attempts === "number" ? String(lesson.question_attempts) : null],
    ["AI assistant muted", yesNo(lesson.mute_ai_assistant)],
    ["Editor stage", label(readString(lesson, "creation_stage"))],
    ["Unpublished changes", yesNo(lesson.has_unpublished_changes)],
  ];

  return items.flatMap(([itemLabel, value]) => (value && !URL_LIKE.test(value) ? [{ label: itemLabel, value }] : []));
}

function misconceptions(lesson: Record<string, unknown>): KyronDraftContentResponse["misconceptions"] {
  return records(lesson.lesson_misconceptions).flatMap((item) => {
    const name = readString(item, "name");

    return name
      ? [{ name, description: readString(item, "description"), targetActivityId: readId(item.target_activity_id) }]
      : [];
  });
}

function mapSection(section: Record<string, unknown> & { id: number }, index: number): KyronContentSection {
  return {
    id: section.id,
    position: typeof section.position === "number" ? section.position : index + 1,
    topic: readString(section, "topic"),
    objectives: readStrings(section, "structured_learning_objectives"),
    understandings: readStrings(section, "enduring_understandings"),
    essentialQuestions: records(section.essential_questions).flatMap((item) => {
      const question = readString(item, "question");

      return question ? [question] : [];
    }),
  };
}

function mapActivity(record: unknown): KyronContentActivity {
  const raw = asRecord(record) ?? {};
  const activity = parseActivity(record);
  const qaActivity = mapKyronActivity(activity);
  const editable = new Set(activityFieldPaths(qaActivity));
  const field = (fieldPath: string, fieldLabel: string, value: string | null): KyronContentField => ({
    key: fieldKey(qaActivity.id, fieldPath),
    label: fieldLabel,
    value,
    access: accessFor(fieldPath, editable),
  });
  const isChoice = (qaActivity.question?.options.length ?? 0) > 0;
  const layouts = sceneLayouts(raw);
  const fields = [
    activity.content ? field("narration", activity.scenes.length > 0 ? "Script (kept in step with the scenes)" : "Script", activity.content) : null,
    activity.question ? field("question.prompt", "Question", activity.question) : null,
    activity.answer ? field("question.rationale", isChoice ? "Explanation" : "Model answer", activity.answer) : null,
    isChoice ? field("question.answerKey", "Answer key", qaActivity.question?.answerKey.join(", ") || null) : null,
  ];

  return {
    id: String(activity.id),
    name: activity.name,
    type: activity.type,
    typeLabel: label(activity.type) ?? "Activity",
    sectionId: readId(raw.lesson_section_id),
    fields: fields.filter((item): item is KyronContentField => item !== null),
    scenes: activity.scenes.map((scene): KyronContentScene => ({
      id: scene.id,
      part: scene.part,
      partLabel: label(scene.part) ?? scene.part,
      layout: label(layouts.get(scene.id) ?? null),
      fields: [
        field(`scenes.${scene.id}.title`, "Title", scene.title || null),
        field(`scenes.${scene.id}.onScreenText`, "On-screen text", scene.text || null),
        field(`scenes.${scene.id}.narration`, "Narration", scene.narration || null),
      ],
      hasVideo: scene.hasVideo,
      hasCaptions: scene.captionsUrl !== null,
    })),
    options: activity.responses.map((response) => ({
      id: String(response.id ?? ""),
      text: response.text,
      correct: response.correct,
    })),
    modelAnswers: records(raw.answer_options).flatMap((item) => {
      const answer = readString(item, "answer");

      return answer ? [answer] : [];
    }),
    questionBank: readStrings(raw, "question_bank"),
    knowledge: activity.knowledge,
  };
}

function vocabulary(value: unknown): KyronDraftContentResponse["vocabulary"] {
  const items = Array.isArray(value) ? value : asRecord(value)?.vocabulary_items;

  return records(items).flatMap((item) => {
    const id = readId(item.id);
    const term = readString(item, "term");

    if (!id || !term) {
      return [];
    }

    const termField = (fieldPath: "term" | "definition", fieldLabel: string, text: string | null): KyronContentField => ({
      key: fieldKey(VOCABULARY_ACTIVITY_ID, `vocabulary.${id}.${fieldPath}`),
      label: fieldLabel,
      value: text,
      access: "qa_fixes",
    });

    return [{
      id: String(id),
      term: termField("term", "Term", term),
      definition: termField("definition", "Definition", readString(item, "definition")),
    }];
  });
}

function publishCheck(value: unknown): KyronDraftContentResponse["publishCheck"] {
  return records(value).flatMap((item) => {
    const name = readString(item, "name");

    return name ? [{ name, activityCount: Array.isArray(item.activity_ids) ? item.activity_ids.length : 0 }] : [];
  });
}

// The same rules the revision agent uses: fields it may be given can be
// fixed (the answer key included); the rest are only read by the checks.
function accessFor(fieldPath: string, editable: ReadonlySet<string>): KyronFieldAccess {
  return editable.has(fieldPath) ? "qa_fixes" : "qa_reads";
}

// Name, audience and objective; lesson-wide findings may change them.
function lessonField(fieldPath: string, fieldLabel: string, value: string | null): KyronContentField {
  return { key: fieldKey(null, fieldPath), label: fieldLabel, value, access: value ? "qa_fixes" : "qa_reads" };
}

function readField(fieldLabel: string, value: string | null): KyronContentField {
  return { key: null, label: fieldLabel, value, access: "qa_reads" };
}

function sceneLayouts(activity: Record<string, unknown>): Map<string, string | null> {
  return new Map(
    VIDEO_PARTS.flatMap((part) =>
      records(asRecord(activity[part])?.scenes).map((scene) => [String(scene.id), readString(scene, "scene_layout")] as const),
    ),
  );
}

type SectionRecord = Record<string, unknown> & { id: number };

function sortedSections(value: unknown): SectionRecord[] {
  const items = records(asRecord(value)?.lesson_sections);

  return items
    .flatMap((item): SectionRecord[] => {
      const id = readId(item.id);

      return id ? [{ ...item, id }] : [];
    })
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
}

function listIds(value: unknown): number[] {
  return records(value).flatMap((item) => {
    const id = readId(item.id);

    return id ? [id] : [];
  });
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);

    return record ? [record] : [];
  });
}

// "clarifying_conversation" → "Clarifying conversation".
function label(value: string | null): string | null {
  const text = value?.replace(/_/g, " ").trim();

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

function yesNo(value: unknown): string | null {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : null;
}

function readId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function invalid(detail: string): KyronMcpError {
  return new KyronMcpError("KYRON_INVALID_RESPONSE", `Kyron returned an unexpected response: ${detail}.`);
}
