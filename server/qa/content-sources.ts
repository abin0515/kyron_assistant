import "server-only";

import {
  getDraftWorkspaceById,
  updateDraftWorkspace,
} from "@/server/drafts/workspaces/repository";
import { hasKyronWriteAccess } from "@/server/kyron-mcp/service";
import type { DraftWorkspace, QaContentSourceKind, QaLesson } from "@/types/api";

import {
  buildSetupPacket,
  isSetupFieldPath,
  readWorkspaceSetupField,
  setupFieldUpdate,
} from "./course-setup-fields";
import {
  mapKyronLesson,
  readKyronCaptions,
  readKyronField,
  readKyronLessonData,
  readKyronRenderStatus,
  requestKyronRender,
  writeKyronField,
} from "./kyron-lesson";
import type { LessonPacket } from "./types";
import { loadWorkspaceReferences } from "./workspace-references";

export type VideoJobStatus = "pending" | "done" | "failed";

// Drafts whose name starts with this may be changed while writes are limited
// to test content.
export const TEST_CONTENT_PREFIX = "[QA Test]";

// Where QA content comes from and whether the agent can change it. Every
// source feeds the same normalized snapshot.
export type LessonContentSource = {
  kind: QaContentSourceKind;
  readable: boolean;
  writable: boolean;
  supportsVideo: boolean;
  readLesson(lesson: QaLesson): Promise<LessonPacket>;
  readField(lesson: QaLesson, activityId: string, fieldPath: string): Promise<string | null>;
  writeField(lesson: QaLesson, activityId: string, fieldPath: string, value: string): Promise<void>;
  requestVideo(lesson: QaLesson): Promise<string>;
  getVideoStatus(lesson: QaLesson, jobId: string): Promise<VideoJobStatus>;
  downloadVideo(lesson: QaLesson, jobId: string): Promise<{ fileName: string; bytes: Uint8Array }>;
  // Sources that render their own video can return its spoken text directly
  // (for Kyron, the captions) instead of a file to transcribe.
  readRenderedNarration?(lesson: QaLesson): Promise<string>;
};

export class ContentSourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSourceUnavailableError";
  }
}

// Whether a source may write or render depends on the lesson (test content
// only, unless widened) and on the Kyron sign-in, so it is resolved per run.
export async function resolveContentSource(
  kind: QaContentSourceKind,
  lesson: QaLesson,
): Promise<LessonContentSource> {
  switch (kind) {
    case "manual":
      return manualSource;
    case "workspace_setup":
      return workspaceSetupSource;
    case "kyron_mcp": {
      const writable = allowedFor(lesson, "QA_KYRON_WRITES", "test-only") && (await hasKyronWriteAccess());

      return kyronSource({ writable, video: writable && allowedFor(lesson, "QA_KYRON_VIDEO", "off") });
    }
  }
}

// The course setup lives in the launcher's own workspace, so the agent can
// read it with its source material and apply fixes before Kyron generation.
const workspaceSetupSource: LessonContentSource = {
  kind: "workspace_setup",
  readable: true,
  writable: true,
  supportsVideo: false,
  async readLesson(lesson) {
    const workspace = await requireWorkspace(lesson);

    return buildSetupPacket(workspace, await workspaceReferences(lesson, workspace));
  },
  async readField(lesson, _activityId, fieldPath) {
    if (!isSetupFieldPath(fieldPath)) {
      return null;
    }

    return readWorkspaceSetupField(await requireWorkspace(lesson), fieldPath);
  },
  async writeField(lesson, _activityId, fieldPath, value) {
    const update = isSetupFieldPath(fieldPath) ? setupFieldUpdate(fieldPath, value) : null;

    if (!update) {
      throw new Error(`"${value}" is not a valid value for ${fieldPath}.`);
    }

    const saved = await updateDraftWorkspace(lesson.workspaceId ?? "", lesson.ownerId, update);

    if (!saved) {
      throw new ContentSourceUnavailableError(
        "The workspace can no longer be edited: it was submitted or a course setup is being generated.",
      );
    }
  },
  requestVideo: unsupported("A course setup has no video."),
  getVideoStatus: unsupported("A course setup has no video."),
  downloadVideo: unsupported("A course setup has no video."),
};

// Generated lesson content pasted on the workspace page. The agent cannot
// change it; fixes are proposed for a person to apply in Kyron Studio.
const manualSource: LessonContentSource = {
  kind: "manual",
  readable: false,
  writable: false,
  supportsVideo: false,
  readLesson: unsupported("Pasted lesson content is replaced by pasting it again."),
  readField: unsupported("Pasted lesson content cannot be read field by field."),
  writeField: unsupported("Pasted lesson content cannot be changed by the agent."),
  requestVideo: unsupported("Pasted lesson content cannot request video generation."),
  getVideoStatus: unsupported("Pasted lesson content has no video jobs."),
  downloadVideo: unsupported("Pasted lesson content has no video jobs."),
};

// The generated lesson in Kyron, read and changed through Kyron MCP. Fixes
// are written scene by scene with Kyron's lock version; video is rendered by
// Kyron and checked through its captions.
function kyronSource({ video, writable }: { video: boolean; writable: boolean }): LessonContentSource {
  return {
    kind: "kyron_mcp",
    readable: true,
    writable,
    supportsVideo: video,
    async readLesson(lesson) {
      const draftId = requireDraftId(lesson);
      const data = await readKyronLessonData(draftId);

      if (data.status !== "done") {
        throw new ContentSourceUnavailableError(
          `Kyron is still working on draft ${draftId} (${data.status}). Re-run the check once it is done.`,
        );
      }

      return { ...mapKyronLesson(data), references: await workspaceReferences(lesson) };
    },
    readField: (lesson, activityId, fieldPath) => readKyronField(requireDraftId(lesson), activityId, fieldPath),
    async writeField(lesson, activityId, fieldPath, value) {
      if (!writable) {
        throw new ContentSourceUnavailableError(
          "Writing to this Kyron draft is not allowed (Kyron write permission or QA_KYRON_WRITES).",
        );
      }

      await writeKyronField(requireDraftId(lesson), activityId, fieldPath, value);
    },
    async requestVideo(lesson) {
      if (!video) {
        throw new ContentSourceUnavailableError("Kyron video rendering is turned off (QA_KYRON_VIDEO).");
      }

      return requestKyronRender(requireDraftId(lesson));
    },
    getVideoStatus: (lesson) => readKyronRenderStatus(requireDraftId(lesson)),
    downloadVideo: unsupported("Kyron videos are checked through their captions."),
    readRenderedNarration: (lesson) => readKyronCaptions(requireDraftId(lesson)),
  };
}

// QA_KYRON_WRITES / QA_KYRON_VIDEO: "off", "test-only" (drafts named
// "[QA Test] …") or "all".
function allowedFor(lesson: QaLesson, variable: string, fallback: "off" | "test-only"): boolean {
  const mode = process.env[variable]?.trim() || fallback;

  if (mode === "all") {
    return true;
  }

  return mode === "test-only" && lesson.title.startsWith(TEST_CONTENT_PREFIX);
}

async function workspaceReferences(lesson: QaLesson, known?: DraftWorkspace) {
  if (!lesson.workspaceId) {
    return [];
  }

  const workspace = known ?? (await requireWorkspace(lesson));

  return loadWorkspaceReferences({
    ownerId: lesson.ownerId,
    sourceText: workspace.sourceText,
    workspaceId: workspace.id,
  });
}

async function requireWorkspace(lesson: QaLesson): Promise<DraftWorkspace> {
  const workspace = lesson.workspaceId
    ? await getDraftWorkspaceById(lesson.workspaceId, lesson.ownerId)
    : null;

  if (!workspace) {
    throw new ContentSourceUnavailableError("The draft workspace for this QA run no longer exists.");
  }

  return workspace;
}

function requireDraftId(lesson: QaLesson): number {
  if (!lesson.kyronLessonId) {
    throw new ContentSourceUnavailableError("This QA record is not linked to a Kyron draft.");
  }

  return lesson.kyronLessonId;
}

function unsupported(message: string) {
  return (): never => {
    throw new ContentSourceUnavailableError(message);
  };
}
