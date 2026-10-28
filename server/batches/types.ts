export const BATCH_SETUP_STATUSES = [
  "manual",
  "pending",
  "generating",
  "needs_review",
  "reviewed",
  "error",
] as const;

export type BatchSetupStatus = (typeof BATCH_SETUP_STATUSES)[number];

export type DeleteDraftBatchResult = "deleted" | "not_found";
