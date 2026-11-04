import type { KyronMcpToolSummary, KyronToolQaUse } from "@/types/api";

export type ToolGroup = {
  id: string;
  label: string;
  description: string;
  tools: KyronMcpToolSummary[];
};

// First matching rule wins, so the narrower areas come first.
const GROUP_RULES: Array<Omit<ToolGroup, "tools"> & { match: RegExp }> = [
  {
    id: "learners",
    label: "Learner activity",
    description: "Learner sessions, answers, transcripts and surveys.",
    match: /lesson_instance|activity_instance|learners|survey/,
  },
  {
    id: "comments",
    label: "Review comments",
    description: "Comment threads on lessons.",
    match: /comment/,
  },
  {
    id: "courses",
    label: "Courses and drafts",
    description: "Lesson collections (drafts): create, copy, generate, publish, versions, SCORM.",
    match: /lesson_collection|cfu_lesson/,
  },
  {
    id: "look",
    label: "Look and feel",
    description: "Scene templates, layouts, background textures and avatars.",
    match: /scene_template|scene_layout|bg_texture|avatars/,
  },
  {
    id: "content",
    label: "Lesson content",
    description: "Lessons, sections, activities, scenes, segments, vocabulary and video renders.",
    match: /lesson_section|lesson_activit|lesson_segment|vocabulary|^get_lesson$|^update_lesson$|validate_lesson|lock_version|lesson_videos/,
  },
  {
    id: "assets",
    label: "Files and assets",
    description: "Asset folders, attachments, uploads and canvases.",
    match: /asset_folder|attachment|direct_upload|aux_contents|canvas/,
  },
  {
    id: "organization",
    label: "Organization and access",
    description: "Organizations, access policies, API keys, LTI platforms and the signed-in user.",
    match: /organization|access_polic|api_key|lti_platform|current_user/,
  },
];

const OTHER = { id: "other", label: "Other", description: "Regeneration logs and audio transcription." };

export const QA_USE_LABELS: Record<KyronToolQaUse, { label: string; variant: "success" | "info" | "neutral" | "warning" }> = {
  reads: { label: "QA reads", variant: "success" },
  writes: { label: "QA writes", variant: "info" },
  renders: { label: "QA renders video (off)", variant: "neutral" },
  forbidden: { label: "Forbidden for this account", variant: "warning" },
};

// Groups the tools by area, in a fixed order, dropping empty groups.
export function groupKyronTools(tools: KyronMcpToolSummary[]): ToolGroup[] {
  const groups = [...GROUP_RULES, OTHER].map(
    (group): ToolGroup => ({ id: group.id, label: group.label, description: group.description, tools: [] }),
  );

  for (const tool of tools) {
    const index = GROUP_RULES.findIndex((rule) => rule.match.test(tool.name));

    groups[index === -1 ? groups.length - 1 : index].tools.push(tool);
  }

  return groups.filter((group) => group.tools.length > 0);
}

export function filterKyronTools(
  tools: KyronMcpToolSummary[],
  { query, usedByQa }: { query: string; usedByQa: boolean },
): KyronMcpToolSummary[] {
  const needle = query.trim().toLowerCase();

  return tools.filter(
    (tool) =>
      (!usedByQa || tool.qaUse !== null) &&
      (!needle || tool.name.includes(needle) || (tool.description ?? "").toLowerCase().includes(needle)),
  );
}
