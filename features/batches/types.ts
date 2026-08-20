export type BatchDraftStatus =
  | "processing"
  | "ready"
  | "needs_review"
  | "error"
  | "submitting"
  | "generating"
  | "complete";

export type BatchFilter =
  | "all"
  | "ready"
  | "needs_review"
  | "active"
  | "complete"
  | "error";

export type BatchAssetType = "lesson" | "practice" | "scenario";

export type BatchCourseSetup = {
  title: string;
  description: string;
  learningObjective: string;
  audience: string;
  assetType: BatchAssetType;
  duration: 480 | 900 | 1800 | 3600;
};

export type BatchDraftItem = {
  id: string;
  fileName: string;
  fileSize: number;
  status: BatchDraftStatus;
  statusMessage: string;
  setup: BatchCourseSetup;
};
