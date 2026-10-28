import type {
  BatchDraftItem,
  BatchDraftStatus,
  BatchFilter,
  BatchOverallStatus,
  BatchRecord,
} from "@/features/batches/types";

export function getBatchOverallStatus(batch: BatchRecord): BatchOverallStatus {
  if (
    batch.workspaces.some((workspace) =>
      ["setup_error", "kyron_error"].includes(workspace.status),
    )
  ) {
    return "attention";
  }

  if (
    batch.workspaces.length > 0 &&
    batch.workspaces.every((workspace) => workspace.status === "complete")
  ) {
    return "complete";
  }

  return "active";
}

export function matchesWorkspaceFilter(
  status: BatchDraftStatus,
  filter: BatchFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "pending") {
    return ["setup_pending", "setup_generating"].includes(status);
  }

  if (filter === "active") {
    return ["setup_generating", "submitting", "generating"].includes(status);
  }

  if (filter === "error") {
    return ["setup_error", "kyron_error"].includes(status);
  }

  return status === filter;
}

export function countWorkspaceStatus(
  items: BatchDraftItem[],
  status: BatchDraftStatus,
): number {
  return items.filter((item) => item.status === status).length;
}

export function countCompletedWorkspaces(batch: BatchRecord): number {
  return batch.workspaces.filter((workspace) => workspace.status === "complete")
    .length;
}
