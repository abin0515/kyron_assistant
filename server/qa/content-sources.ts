import "server-only";

import {
  getDraftWorkspaceById,
  updateDraftWorkspace,
} from "@/server/drafts/workspaces/repository";
import { KyronMcpError } from "@/server/kyron-mcp/errors";
import type { DraftWorkspace, QaContentSourceKind, QaLesson } from "@/types/api";

import {
  buildSetupPacket,
  isSetupFieldPath,
  readWorkspaceSetupField,
  setupFieldUpdate,
} from "./course-setup-fields";
import type { LessonPacket } from "./types";
import { loadWorkspaceReferences } from "./workspace-references";

export type VideoJobStatus = "pending" | "done" | "failed";

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
};

export class ContentSourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSourceUnavailableError";
  }
}

export function getContentSource(kind: QaContentSourceKind): LessonContentSource {
  switch (kind) {
    case "manual":
      return manualSource;
    case "workspace_setup":
      return workspaceSetupSource;
    case "kyron_mcp":
      return kyronMcpSource;
  }
}

export function isKyronContentSourceAvailable(): boolean {
  return kyronMcpSource.readable;
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

    return buildSetupPacket(
      workspace,
      await loadWorkspaceReferences({
        ownerId: lesson.ownerId,
        sourceText: workspace.sourceText,
        workspaceId: workspace.id,
      }),
    );
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

// Reading, editing and video generation through Kyron MCP depend on tools that
// are only visible after Kyron sign-in. Implement these methods from the
// capability manifest on the Kyron connection page, then set readable,
// writable and supportsVideo to true.
const kyronMcpSource: LessonContentSource = {
  kind: "kyron_mcp",
  readable: false,
  writable: false,
  supportsVideo: false,
  readLesson: notMapped,
  readField: notMapped,
  writeField: notMapped,
  requestVideo: notMapped,
  getVideoStatus: notMapped,
  downloadVideo: notMapped,
};

async function requireWorkspace(lesson: QaLesson): Promise<DraftWorkspace> {
  const workspace = lesson.workspaceId
    ? await getDraftWorkspaceById(lesson.workspaceId, lesson.ownerId)
    : null;

  if (!workspace) {
    throw new ContentSourceUnavailableError("The draft workspace for this QA run no longer exists.");
  }

  return workspace;
}

function notMapped(): never {
  throw new KyronMcpError(
    "KYRON_MCP_NOT_CONFIGURED",
    "Waiting for Kyron MCP lesson access. Until it is connected, paste the generated lesson content on the workspace page to check it.",
  );
}

function unsupported(message: string) {
  return (): never => {
    throw new ContentSourceUnavailableError(message);
  };
}
