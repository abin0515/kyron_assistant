import type { DraftPollingPhase } from "@/features/drafts/kyron-drafts/types";
import type {
  DraftWorkspace,
  DraftWorkspaceSummary,
  ManagedDraft,
} from "@/types/api";

export type DisplayDraftStatus =
  | "editing"
  | "generating"
  | "complete"
  | "attention"
  | "not_found";

export function getStoredDraftDisplayStatus(
  workspace: DraftWorkspaceSummary,
  draft: ManagedDraft | null,
): DisplayDraftStatus {
  if (draft?.kyronAvailability === "unavailable") {
    return "not_found";
  }

  if (draft?.status === "done") {
    return "complete";
  }

  if (draft?.status === "error" || workspace.status === "error") {
    return "attention";
  }

  if (
    draft?.status === "started" ||
    workspace.status === "submitting" ||
    workspace.status === "submitted"
  ) {
    return "generating";
  }

  return "editing";
}

export function getWorkspaceEditorDisplayStatus(
  workspace: DraftWorkspace,
  phase: DraftPollingPhase,
): DisplayDraftStatus {
  if (phase === "unavailable") {
    return "not_found";
  }

  if (workspace.status === "error") {
    return "attention";
  }

  if (phase === "complete") {
    return "complete";
  }

  if (phase === "generation_error" || phase === "request_error") {
    return "attention";
  }

  return workspace.kyronDraftId ? "generating" : "editing";
}

export function getPollingDraftDisplayStatus(
  phase: DraftPollingPhase,
): DisplayDraftStatus {
  if (phase === "complete") {
    return "complete";
  }

  if (phase === "unavailable") {
    return "not_found";
  }

  if (phase === "generation_error" || phase === "request_error") {
    return "attention";
  }

  return "generating";
}
