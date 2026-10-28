import type { DisplayDraftStatus } from "@/features/drafts/shared/status";
import type {
  DraftWorkspaceSummary,
  ManagedDraft,
} from "@/types/api";

export type DraftRecord = {
  draft: ManagedDraft | null;
  status: DisplayDraftStatus;
  workspace: DraftWorkspaceSummary;
};

export type DraftFilter =
  | "all"
  | "editing"
  | "generating"
  | "complete"
  | "attention";

export type DraftLoadMode = "stored" | "sync-generating" | "sync-all";
