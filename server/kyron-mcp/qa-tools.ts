import type { KyronToolQaUse } from "@/types/api";

// The read-only Kyron tools the QA harness calls to read a lesson.
export const QA_READ_TOOLS: ReadonlySet<string> = new Set([
  "get_lesson_collection",
  "get_lesson",
  "list_lesson_sections",
  "list_lesson_activities",
  "get_lesson_activity",
  "list_vocabulary_items",
  "get_lesson_lock_version",
  "validate_lesson",
]);

// The only Kyron tools that change content which QA may call.
export const QA_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "update_lesson_activity",
  "update_lesson",
  "update_lesson_section",
  "update_vocabulary_item",
]);

// Renders video for the lesson; used only after its script passes QA.
export const QA_RENDER_TOOL = "regenerate_all_lesson_videos";

// Read-only tools that answered "Access forbidden" for this account, even
// with write permission (checked November 2, 2026).
const FORBIDDEN_TOOLS: ReadonlySet<string> = new Set(["get_lesson_segment", "get_lesson_segment_transcript"]);

export function qaUseFor(name: string): KyronToolQaUse | null {
  if (QA_READ_TOOLS.has(name)) {
    return "reads";
  }

  if (QA_WRITE_TOOLS.has(name)) {
    return "writes";
  }

  if (name === QA_RENDER_TOOL) {
    return "renders";
  }

  return FORBIDDEN_TOOLS.has(name) ? "forbidden" : null;
}
