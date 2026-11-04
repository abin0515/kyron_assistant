import "server-only";

import { createHash } from "node:crypto";

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { withKyronReader, withKyronWriter } from "@/server/kyron-mcp/service";
import type { KyronToolReader } from "@/server/kyron-mcp/types";
import type { QaActivity, QaActivityType, QaLessonContent, QaQuestion, QaScene } from "@/types/api";

import { ContentConflictError } from "./content-errors";
import type { VideoJobStatus } from "./content-sources";
import { MAX_FIELD_LENGTH, readActivityField, readLessonField, replaceOnce } from "./snapshot";
import type { LessonPacket } from "./types";

export const VOCABULARY_ACTIVITY_ID = "vocabulary";

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
const SCENE_FIELD = /^scenes\.([^.]+)\.(narration|title|onScreenText)$/;
const TERM_FIELD = /^vocabulary\.([^.]+)\.(term|definition)$/;
const KYRON_SCENE_FIELDS = { narration: "scene_narration", title: "scene_title", onScreenText: "scene_text" } as const;
const KYRON_LESSON_FIELDS: Record<string, string> = {
  "lesson.title": "name",
  "lesson.audience": "audience",
  "lesson.objective": "objective",
};
const CONFLICT_MESSAGE = /409|conflict|lock.?version|stale|has changed/i;
const CAPTIONS_TIMEOUT_MS = 20_000;

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
  id: string;
  part: string;
  title: string;
  text: string;
  narration: string;
  // The stored HTML, so an edit keeps the same formatting.
  rawText: string;
  rawNarration: string;
  hasVideo: boolean;
  // Signed link to the rendered captions; used once, never stored.
  captionsUrl: string | null;
};

export type KyronActivity = {
  id: number;
  name: string;
  type: string;
  content: string;
  rawContent: string;
  question: string | null;
  answer: string | null;
  responses: Array<{ id: number | null; text: string; correct: boolean }>;
  knowledge: Array<{ knowledge: string; misconceptions: string[] }>;
  scenes: KyronScene[];
};

export type KyronTerm = { id: number; term: string; definition: string | null };

export type KyronLessonData = {
  status: string;
  lesson: KyronLesson;
  sections: KyronSection[];
  activities: KyronActivity[];
  vocabulary: KyronTerm[];
};

// Reads a generated draft through Kyron MCP: collection → draft lesson →
// sections → activities, plus the vocabulary. Only read-only tools are called.
export async function readKyronLessonData(draftId: number): Promise<KyronLessonData> {
  return withKyronReader(async (read) => {
    const collection = await readCollection(read, draftId);
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

    return {
      status: collection.status,
      lesson,
      sections,
      activities,
      vocabulary: parseVocabulary(await read("list_vocabulary_items", { lesson_id: lesson.id })),
    };
  });
}

// Reads one field again, for the check before and after a write.
export async function readKyronField(
  draftId: number,
  activityId: string,
  fieldPath: string,
): Promise<string | null> {
  return withKyronReader(async (read) => {
    if (activityId === VOCABULARY_ACTIVITY_ID || fieldPath.startsWith("lesson.")) {
      const { lessonId } = await readCollection(read, draftId);

      if (fieldPath.startsWith("lesson.")) {
        return readLessonField(mapLessonContent(parseLesson(await read("get_lesson", { id: lessonId })), []), fieldPath);
      }

      const terms = parseVocabulary(await read("list_vocabulary_items", { lesson_id: lessonId }));

      return readActivityField(vocabularyActivity(terms), fieldPath);
    }

    const id = activityNumber(activityId);

    return readActivityField(mapKyronActivity(parseActivity(await read("get_lesson_activity", { id }))), fieldPath);
  });
}

// Writes one field with the lesson's current lock version, so Kyron refuses
// the edit if anyone changed the lesson since. A refusal becomes a conflict.
export async function writeKyronField(
  draftId: number,
  activityId: string,
  fieldPath: string,
  value: string,
): Promise<void> {
  await withKyronWriter(async ({ read, write }) => {
    const { lessonId } = await readCollection(read, draftId);
    const lockVersion = parseLockVersion(await read("get_lesson_lock_version", { id: lessonId }));
    const detail = { activityId, fieldPath, valueHash: createHash("sha256").update(value).digest("hex").slice(0, 12) };

    try {
      const term = TERM_FIELD.exec(fieldPath);

      if (activityId === VOCABULARY_ACTIVITY_ID && term) {
        await write("update_vocabulary_item", { id: Number(term[1]), [term[2]]: value }, detail);
      } else if (KYRON_LESSON_FIELDS[fieldPath]) {
        await write(
          "update_lesson",
          { id: lessonId, [KYRON_LESSON_FIELDS[fieldPath]]: value, lesson_lock_version: lockVersion },
          detail,
        );
      } else {
        const activity = parseActivity(await read("get_lesson_activity", { id: activityNumber(activityId) }));

        await write(
          "update_lesson_activity",
          { id: activity.id, ...buildActivityUpdate(activity, fieldPath, value), lesson_lock_version: lockVersion },
          detail,
        );
      }
    } catch (error) {
      if (error instanceof KyronMcpError && error.code === "KYRON_INVALID_RESPONSE" && CONFLICT_MESSAGE.test(error.message)) {
        throw new ContentConflictError("The Kyron lesson changed since it was checked, so the fix was not applied.");
      }

      throw error;
    }
  });
}

// Starts Kyron's render of every video in the lesson. Called only after the
// script passed QA, and at most twice per run.
export async function requestKyronRender(draftId: number): Promise<string> {
  return withKyronWriter(async ({ read, write }) => {
    const { lessonId } = await readCollection(read, draftId);

    await write("regenerate_all_lesson_videos", { id: lessonId });

    return `kyron-render:${lessonId}:${Date.now()}`;
  });
}

// Kyron's own publish check lists missing videos until rendering finishes.
export async function readKyronRenderStatus(draftId: number): Promise<VideoJobStatus> {
  return withKyronReader(async (read) => {
    const { lessonId } = await readCollection(read, draftId);
    const problems = await read("validate_lesson", { id: lessonId });
    const names = (Array.isArray(problems) ? problems : []).map((problem) => readText(asRecord(problem)?.name) ?? "");

    if (names.some((name) => /video/i.test(name) && /fail/i.test(name))) {
      return "failed";
    }

    return names.some((name) => /video/i.test(name)) ? "pending" : "done";
  });
}

// The rendered narration, from each scene's captions in lesson order.
export async function readKyronCaptions(draftId: number): Promise<string> {
  const data = await readKyronLessonData(draftId);
  const parts: string[] = [];

  for (const activity of data.activities) {
    const lines: string[] = [];

    for (const scene of activity.scenes) {
      if (scene.captionsUrl) {
        lines.push(await fetchCaptions(scene.captionsUrl));
      }
    }

    if (lines.some(Boolean)) {
      parts.push(`[ACTIVITY ${activity.id}] ${activity.name}\n${lines.filter(Boolean).join("\n")}`);
    }
  }

  return parts.join("\n\n");
}

// The update_lesson_activity arguments for one field. Never asks Kyron to
// regenerate scenes or video; deleting scenes is not possible here.
export function buildActivityUpdate(
  activity: KyronActivity,
  fieldPath: string,
  value: string,
): Record<string, unknown> {
  const sceneMatch = SCENE_FIELD.exec(fieldPath);

  if (sceneMatch) {
    const scene = activity.scenes.find((candidate) => candidate.id === sceneMatch[1]);
    const field = sceneMatch[2] as keyof typeof KYRON_SCENE_FIELDS;

    if (!scene) {
      throw new Error(`Scene ${sceneMatch[1]} is not part of Kyron activity ${activity.id}.`);
    }

    const stored =
      field === "title" ? value : toStoredHtml(value, field === "onScreenText" ? scene.rawText : scene.rawNarration);
    const update: Record<string, unknown> = {
      [scene.part]: { scenes: [{ id: Number(scene.id), [KYRON_SCENE_FIELDS[field]]: stored }] },
    };

    // A lecture's script is the scenes' narration in order; keep it in step.
    if (field === "narration" && INSTRUCTION_TYPES.has(activity.type)) {
      const content = replaceOnce(activity.rawContent, scene.narration, value);

      if (content && content !== activity.rawContent) {
        update.content = content;
      }
    }

    return update;
  }

  switch (fieldPath) {
    case "narration":
      if (activity.scenes.length > 0) {
        throw new Error("Lecture narration is edited scene by scene.");
      }

      return { content: value };
    case "question.prompt":
      return { question: value };
    case "question.rationale":
      return { answer: value };
    case "question.answerKey": {
      const keys = value.split(",").map((key) => key.trim());

      if (activity.responses.length === 0 || activity.responses.some((response) => response.id === null)) {
        throw new Error("This Kyron activity has no answer options to mark.");
      }

      return {
        responses: activity.responses.map((response) => ({
          internal_id: response.id,
          is_correct: keys.includes(String(response.id)),
        })),
      };
    }
    default:
      throw new Error(`${fieldPath} cannot be written to Kyron.`);
  }
}

// Builds the QA snapshot packet; the content source adds the references.
export function mapKyronLesson({
  activities,
  lesson,
  sections,
  vocabulary,
}: KyronLessonData): Omit<LessonPacket, "references"> {
  const mapped = activities.map(mapKyronActivity);

  return {
    lesson: mapLessonContent(lesson, sections),
    activities: vocabulary.length > 0 ? [...mapped, vocabularyActivity(vocabulary)] : mapped,
  };
}

export function mapKyronActivity(activity: KyronActivity): QaActivity {
  const question = questionFor(activity);
  const scenes: QaScene[] = activity.scenes.map((scene) => ({
    id: scene.id,
    part: scene.part,
    title: limit(scene.title),
    onScreenText: limit(scene.text),
    narration: limit(scene.narration),
    hasVideo: scene.hasVideo,
  }));
  const sceneNarration = activity.scenes.map((scene) => scene.narration).filter(Boolean).join("\n\n");
  const onScreen = activity.scenes
    .map((scene) => [scene.title, scene.text].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");
  const isConversation = activity.type.endsWith("conversation");

  return {
    id: String(activity.id),
    title: limit(activity.name),
    type: activityTypeFor(activity.type, question),
    narration: limit(activity.content || sceneNarration),
    onScreenText: limit(onScreen),
    question,
    tutorGuidance: isConversation ? limit(knowledgeFor(activity)) : null,
    // Scene media links are signed and expire, so none are stored.
    media: activity.scenes.map((scene) => ({
      kind: scene.hasVideo ? "video" : "image",
      description: scene.title || null,
      url: null,
    })),
    scenes,
    readOnlyFields: [
      ...(scenes.length > 0 ? ["narration", "onScreenText"] : []),
      ...(isConversation ? ["tutorGuidance"] : []),
    ],
  };
}

function mapLessonContent(lesson: KyronLesson, sections: KyronSection[]): QaLessonContent {
  const objectives = [lesson.objective ?? "", ...sections.flatMap((section) => section.objectives)]
    .map((objective) => objective.trim())
    .filter(Boolean);

  return {
    title: limit(lesson.name) ?? `Kyron lesson ${lesson.id}`,
    description: limit(lesson.description),
    audience: limit(lesson.audience),
    learningObjectives: [...new Set(objectives)].map((objective) => limit(objective) ?? objective),
    durationSeconds: lesson.intendedTime,
    assetType: lesson.lessonType,
  };
}

// Vocabulary is checked like an activity so unsupported terms are caught.
function vocabularyActivity(terms: KyronTerm[]): QaActivity {
  return {
    id: VOCABULARY_ACTIVITY_ID,
    title: "Vocabulary",
    type: "other",
    narration: limit(terms.map((term) => `${term.term}: ${term.definition ?? ""}`).join("\n")),
    onScreenText: null,
    question: null,
    tutorGuidance: null,
    media: [],
    terms: terms.map((term) => ({ id: String(term.id), term: term.term, definition: term.definition })),
    readOnlyFields: ["narration"],
  };
}

function activityTypeFor(type: string, question: QaQuestion | null): QaActivityType {
  if (question && question.options.length > 0) {
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

// Multiple-choice activities carry options marked correct; conversations
// carry an open question and a model answer the tutor grades against.
function questionFor(activity: KyronActivity): QaQuestion | null {
  if (activity.responses.length >= 2 && activity.responses.every((response) => response.id !== null)) {
    return {
      prompt: limit(activity.question ?? activity.name) ?? "",
      options: activity.responses.map((response) => ({ id: String(response.id), text: limit(response.text) ?? "" })),
      answerKey: activity.responses.filter((response) => response.correct).map((response) => String(response.id)),
      rationale: limit(activity.answer),
    };
  }

  return activity.question
    ? { prompt: limit(activity.question) ?? "", options: [], answerKey: [], rationale: limit(activity.answer) }
    : null;
}

function knowledgeFor(activity: KyronActivity): string {
  return activity.knowledge
    .map((item) =>
      [
        `Targets: ${item.knowledge}`,
        item.misconceptions.length > 0 ? `Misconceptions to address: ${item.misconceptions.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

async function readCollection(read: KyronToolReader, draftId: number): Promise<{ lessonId: number; status: string }> {
  const record = asRecord(await read("get_lesson_collection", { id: draftId }));
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

export function parseActivity(value: unknown): KyronActivity {
  const record = asRecord(value);
  const id = readId(record?.id);

  if (!record || !id) {
    throw invalid("activity has no id");
  }

  const rawContent = readText(record.content) ?? "";

  return {
    id,
    name: readText(record.name) ?? "",
    type: readText(record.activity_type) ?? "unknown",
    content: plainText(rawContent),
    rawContent,
    question: readText(record.question),
    answer: readText(record.answer),
    responses: (Array.isArray(record.responses) ? record.responses : []).flatMap((item) => {
      const response = asRecord(item);
      const text = readText(response?.answer) ?? readText(response?.response);

      return text
        ? [{ id: readId(response?.internal_id) ?? readId(response?.id), text, correct: response?.is_correct === true }]
        : [];
    }),
    knowledge: (Array.isArray(record.knowledge_and_misconceptions) ? record.knowledge_and_misconceptions : []).flatMap(
      (item) => {
        const entry = asRecord(item);
        const knowledge = readText(entry?.knowledge);

        return knowledge ? [{ knowledge, misconceptions: readTextList(entry?.misconceptions) }] : [];
      },
    ),
    scenes: VIDEO_FIELDS.flatMap((field) => parseScenes(field, asRecord(record[field])?.scenes)),
  };
}

function parseScenes(part: string, value: unknown): KyronScene[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      const scene = asRecord(item);
      const id = readId(scene?.id);

      if (!scene || !id) {
        return [];
      }

      const rawText = readText(scene.scene_text) ?? "";
      const rawNarration = readText(scene.scene_narration) ?? "";

      return [{
        order: typeof scene.scene_order === "number" ? scene.scene_order : 0,
        scene: {
          id: String(id),
          part,
          title: plainText(readText(scene.scene_title) ?? ""),
          text: plainText(rawText),
          narration: plainText(rawNarration),
          rawText,
          rawNarration,
          hasVideo: Boolean(readText(scene.scene_video_url)),
          captionsUrl: readText(scene.scene_captions_vtt_url),
        },
      }];
    })
    .sort((left, right) => left.order - right.order)
    .map((item) => item.scene);
}

function parseVocabulary(value: unknown): KyronTerm[] {
  const items = Array.isArray(value) ? value : asRecord(value)?.vocabulary_items;

  if (!Array.isArray(items)) {
    throw invalid("vocabulary list is missing");
  }

  return items.flatMap((item) => {
    const record = asRecord(item);
    const id = readId(record?.id);
    const term = readText(record?.term);

    return id && term ? [{ id, term, definition: readText(record?.definition) }] : [];
  });
}

async function fetchCaptions(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(CAPTIONS_TIMEOUT_MS) });

  if (!response.ok) {
    throw new KyronMcpError("KYRON_MCP_UNAVAILABLE", `Kyron captions could not be downloaded (HTTP ${response.status}).`, true);
  }

  return captionText(await response.text());
}

// WebVTT to plain text: cue text only, without timings, numbers or tags.
export function captionText(vtt: string): string {
  return vtt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "WEBVTT" && !line.includes("-->") && !/^\d+$/.test(line) && !line.startsWith("NOTE"))
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join(" ");
}

function parseLockVersion(value: unknown): number {
  const lockVersion = asRecord(value)?.lock_version;

  if (typeof lockVersion !== "number") {
    throw invalid("lock version is missing");
  }

  return lockVersion;
}

// Kyron stores scene text as HTML; edits keep paragraphs or bullet lists.
function toStoredHtml(value: string, original: string): string {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);

  if (/<li[\s>]/i.test(original)) {
    return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`;
  }

  if (/<p[\s>]/i.test(original)) {
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }

  return value;
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function activityNumber(activityId: string): number {
  const id = Number(activityId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`"${activityId}" is not a Kyron activity.`);
  }

  return id;
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
