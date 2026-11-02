import "server-only";

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { withKyronReader } from "@/server/kyron-mcp/service";
import type { KyronToolReader } from "@/server/kyron-mcp/types";
import type { QaActivity, QaActivityType, QaLessonContent, QaQuestion } from "@/types/api";

import { MAX_FIELD_LENGTH } from "./snapshot";
import type { LessonPacket } from "./types";

// Activity fields that hold a video's scenes, in playback order.
const VIDEO_FIELDS = [
  "lecture_video",
  "question_video",
  "wait_video",
  "activity_question_video",
  "activity_wait_video",
  "analysis_wait_video",
] as const;
const INSTRUCTION_TYPES = new Set(["introduction", "lecture", "conclusion"]);
const MAX_ACTIVITIES = 200;
const PAGE_SIZE = 100;

export type KyronLesson = {
  id: number;
  name: string;
  description: string | null;
  audience: string | null;
  objective: string | null;
  intendedTime: number | null;
  lessonType: string | null;
};

export type KyronSection = { id: number; position: number; objectives: string[] };

export type KyronScene = {
  title: string;
  text: string;
  narration: string;
  hasVideo: boolean;
  hasImage: boolean;
};

export type KyronActivity = {
  id: number;
  name: string;
  type: string;
  content: string;
  question: string | null;
  answer: string | null;
  answerOptions: Array<{ text: string; correct: boolean | null }>;
  knowledge: Array<{ knowledge: string; misconceptions: string[] }>;
  scenes: KyronScene[];
};

export type KyronLessonData = {
  status: string;
  lesson: KyronLesson;
  sections: KyronSection[];
  activities: KyronActivity[];
};

// Reads a generated draft through Kyron MCP: collection → draft lesson →
// sections → activities. Only read-only tools are called.
export async function readKyronLessonData(draftId: number): Promise<KyronLessonData> {
  return withKyronReader(async (read) => {
    const collection = parseCollection(await read("get_lesson_collection", { id: draftId }), draftId);
    const lesson = parseLesson(await read("get_lesson", { id: collection.lessonId }));
    const sections = parseSections(
      await read("list_lesson_sections", { lesson_id: lesson.id, per_page: PAGE_SIZE }),
    ).sort((left, right) => left.position - right.position);
    const activities: KyronActivity[] = [];

    for (const section of sections) {
      const listed = parseActivityIds(
        await read("list_lesson_activities", { lesson_id: lesson.id, lesson_section_id: section.id }),
      );

      for (const id of listed.slice(0, MAX_ACTIVITIES - activities.length)) {
        activities.push(parseActivity(await read("get_lesson_activity", { id })));
      }
    }

    return { status: collection.status, lesson, sections, activities };
  });
}

export async function readKyronActivity(activityId: string): Promise<QaActivity | null> {
  const id = Number(activityId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return withKyronReader(async (read) => mapKyronActivity(parseActivity(await read("get_lesson_activity", { id }))));
}

// Builds the QA snapshot packet; the content source adds the references.
export function mapKyronLesson({ activities, lesson, sections }: KyronLessonData): Omit<LessonPacket, "references"> {
  const objectives = [lesson.objective ?? "", ...sections.flatMap((section) => section.objectives)]
    .map((objective) => objective.trim())
    .filter(Boolean);
  const content: QaLessonContent = {
    title: limit(lesson.name) ?? `Kyron lesson ${lesson.id}`,
    description: limit(lesson.description),
    audience: limit(lesson.audience),
    learningObjectives: [...new Set(objectives)].map((objective) => limit(objective) ?? objective),
    durationSeconds: lesson.intendedTime,
    assetType: lesson.lessonType,
  };

  return { lesson: content, activities: activities.map(mapKyronActivity) };
}

export function mapKyronActivity(activity: KyronActivity): QaActivity {
  const question = multipleChoiceQuestion(activity);
  const sceneNarration = activity.scenes.map((scene) => scene.narration).filter(Boolean).join("\n\n");
  const onScreen = activity.scenes
    .map((scene) => [scene.title, scene.text].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");

  return {
    id: String(activity.id),
    title: limit(activity.name),
    type: activityTypeFor(activity.type, question !== null),
    narration: limit(activity.content || sceneNarration),
    onScreenText: limit(onScreen),
    question,
    tutorGuidance: question ? null : limit(tutorGuidanceFor(activity)),
    // Scene media links are signed and expire, so none are stored.
    media: activity.scenes.map((scene) => ({
      kind: scene.hasVideo ? "video" : scene.hasImage ? "image" : "other",
      description: scene.title || null,
      url: null,
    })),
  };
}

function activityTypeFor(type: string, isQuestion: boolean): QaActivityType {
  if (isQuestion) {
    return "question";
  }

  if (INSTRUCTION_TYPES.has(type)) {
    return "instruction";
  }

  if (type === "reflection_conversation") {
    return "reflection";
  }

  if (type.endsWith("conversation")) {
    return "conversation";
  }

  return type.includes("scenario") ? "scenario" : "other";
}

// Options become a multiple-choice question only when Kyron marks which are
// correct. Not yet seen in a live lesson; conversations have no such flags.
function multipleChoiceQuestion(activity: KyronActivity): QaQuestion | null {
  const flagged = activity.answerOptions.filter((option) => option.correct !== null);

  if (activity.answerOptions.length < 2 || flagged.length !== activity.answerOptions.length) {
    return null;
  }

  const options = activity.answerOptions.map((option, index) => ({
    id: String.fromCharCode(65 + index),
    text: limit(option.text) ?? "",
  }));

  return {
    prompt: limit(activity.question ?? activity.name) ?? "",
    options,
    answerKey: options.filter((_, index) => activity.answerOptions[index].correct).map((option) => option.id),
    rationale: limit(activity.answer),
  };
}

// For conversations the tutor works from the question, the model answer and
// the misconceptions it should catch, so these are checked like narration.
function tutorGuidanceFor(activity: KyronActivity): string {
  return [
    activity.question ? `Question: ${activity.question}` : null,
    activity.answer ? `Model answer: ${activity.answer}` : null,
    ...activity.knowledge.map((item) =>
      [
        `Targets: ${item.knowledge}`,
        item.misconceptions.length > 0 ? `Misconceptions to address: ${item.misconceptions.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseCollection(value: unknown, draftId: number): { lessonId: number; status: string } {
  const record = asRecord(value);
  const lessonId = readId(asRecord(record?.draft_lesson)?.id);

  if (!record || !lessonId) {
    throw invalid(`draft ${draftId} has no draft lesson`);
  }

  return {
    lessonId,
    status: readText(asRecord(record.lesson_collection_status)?.status_type) ?? "unknown",
  };
}

function parseLesson(value: unknown): KyronLesson {
  const record = asRecord(value);
  const id = readId(record?.id);

  if (!record || !id) {
    throw invalid("lesson has no id");
  }

  return {
    id,
    name: readText(record.name) ?? "",
    description: readText(record.description),
    audience: readText(record.audience),
    objective: readText(record.objective),
    intendedTime: typeof record.intended_time === "number" && record.intended_time > 0 ? record.intended_time : null,
    lessonType: readText(record.lesson_type),
  };
}

function parseSections(value: unknown): KyronSection[] {
  const items = asRecord(value)?.lesson_sections;

  if (!Array.isArray(items)) {
    throw invalid("section list is missing");
  }

  return items.flatMap((item, index) => {
    const record = asRecord(item);
    const id = readId(record?.id);

    return record && id
      ? [{
          id,
          position: typeof record.position === "number" ? record.position : index + 1,
          objectives: readTextList(record.structured_learning_objectives),
        }]
      : [];
  });
}

function parseActivityIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw invalid("activity list is missing");
  }

  return value.flatMap((item) => {
    const id = readId(asRecord(item)?.id);

    return id ? [id] : [];
  });
}

function parseActivity(value: unknown): KyronActivity {
  const record = asRecord(value);
  const id = readId(record?.id);

  if (!record || !id) {
    throw invalid("activity has no id");
  }

  return {
    id,
    name: readText(record.name) ?? "",
    type: readText(record.activity_type) ?? "unknown",
    content: plainText(readText(record.content) ?? ""),
    question: readText(record.question),
    answer: readText(record.answer),
    answerOptions: (Array.isArray(record.answer_options) ? record.answer_options : []).flatMap((item) => {
      const option = asRecord(item);
      const text = readText(option?.answer) ?? readText(option?.text);
      const correct = option?.correct ?? option?.is_correct;

      return text ? [{ text, correct: typeof correct === "boolean" ? correct : null }] : [];
    }),
    knowledge: (Array.isArray(record.knowledge_and_misconceptions) ? record.knowledge_and_misconceptions : []).flatMap(
      (item) => {
        const entry = asRecord(item);
        const knowledge = readText(entry?.knowledge);

        return knowledge ? [{ knowledge, misconceptions: readTextList(entry?.misconceptions) }] : [];
      },
    ),
    scenes: VIDEO_FIELDS.flatMap((field) => parseScenes(asRecord(record[field])?.scenes)),
  };
}

function parseScenes(value: unknown): KyronScene[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      const scene = asRecord(item);

      return scene
        ? [{
            order: typeof scene.scene_order === "number" ? scene.scene_order : 0,
            title: plainText(readText(scene.scene_title) ?? ""),
            text: plainText(readText(scene.scene_text) ?? ""),
            narration: plainText(readText(scene.scene_narration) ?? ""),
            hasVideo: Boolean(readText(scene.scene_video_url)),
            hasImage: Boolean(readText(scene.scene_image_url)),
          }]
        : [];
    })
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...scene }) => scene);
}

// Scene text arrives as HTML; checks and versions work on plain text.
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function limit(value: string | null): string | null {
  const text = value?.trim();

  return text ? text.slice(0, MAX_FIELD_LENGTH) : null;
}

function readId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalid(detail: string): KyronMcpError {
  return new KyronMcpError("KYRON_INVALID_RESPONSE", `Kyron returned an unexpected response: ${detail}.`);
}
