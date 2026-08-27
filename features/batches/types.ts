import type {
  BatchWorkspaceItem,
  BatchWorkspaceStatus,
  CourseSetup,
  DraftBatch,
  SourceFileListItem,
} from "@/types/api";

export type BatchFilter =
  | "all"
  | "pending"
  | "ready"
  | "needs_review"
  | "active"
  | "complete"
  | "error";

export type BatchOverallStatus = "active" | "attention" | "complete";

export type BatchDraftStatus = BatchWorkspaceStatus;
export type BatchDraftItem = BatchWorkspaceItem;
export type BatchRecord = DraftBatch;
export type BatchCourseSetup = CourseSetup;
export type BatchSourceFile = Pick<
  SourceFileListItem,
  "id" | "name" | "size" | "type"
>;
export type BatchSourceFileType = SourceFileListItem["type"];
