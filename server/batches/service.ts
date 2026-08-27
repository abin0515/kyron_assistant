import "server-only";

import { randomUUID } from "node:crypto";

import {
  claimBatchWorkspaceSetup,
  completeBatchWorkspaceSetup,
  createBatchWithWorkspaces,
  deleteBatch,
  failBatchWorkspaceSetup,
  getBatchById,
  listBatchesByUser,
  markBatchWorkspaceReviewed,
} from "@/server/batches/repository";
import type {
  DeleteDraftBatchResult,
} from "@/server/batches/types";
import { generateCourseSetup } from "@/server/drafts/course-setup/service";
import { updateCurrentWorkspaceSourceFiles } from "@/server/drafts/workspace-source-files/service";
import { updateDraftWorkspace } from "@/server/drafts/workspaces/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import { getSourceFilesByIds } from "@/server/source-files/repository";
import type {
  CourseSetup,
  DraftBatch,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

const MAX_BATCH_WORKSPACES = 20;
const GENERATION_CONCURRENCY = 2;

export async function createCurrentUserBatch(
  name: string,
  sourceFileIds: string[],
): Promise<DraftBatch> {
  const user = await getCurrentUser();
  const normalizedName = name.trim();
  const uniqueSourceFileIds = [...new Set(sourceFileIds)];

  if (!normalizedName || normalizedName.length > 120) {
    throw new BatchValidationError(
      "Batch name must be between 1 and 120 characters.",
    );
  }

  if (
    uniqueSourceFileIds.length === 0 ||
    uniqueSourceFileIds.length > MAX_BATCH_WORKSPACES
  ) {
    throw new BatchValidationError(
      `Select between 1 and ${MAX_BATCH_WORKSPACES} source files.`,
    );
  }

  const sourceFiles = await getSourceFilesByIds(
    uniqueSourceFileIds,
    user.id,
  );

  if (sourceFiles.length !== uniqueSourceFileIds.length) {
    throw new BatchValidationError(
      "One or more selected source files were not found.",
    );
  }

  const batchId = randomUUID();
  await createBatchWithWorkspaces(
    batchId,
    normalizedName,
    user,
    uniqueSourceFileIds.map((sourceFileId) => ({
      workspaceId: randomUUID(),
      sourceFileId,
    })),
  );

  const batch = await getBatchById(batchId, user.id);

  if (!batch) {
    throw new Error("The created batch could not be loaded.");
  }

  return batch;
}

export async function listCurrentUserBatches(): Promise<DraftBatch[]> {
  const user = await getCurrentUser();

  return listBatchesByUser(user.id);
}

export async function getCurrentUserBatch(
  id: string,
): Promise<DraftBatch | null> {
  const user = await getCurrentUser();

  return getBatchById(id, user.id);
}

export async function deleteCurrentUserBatch(
  id: string,
): Promise<DeleteDraftBatchResult> {
  const user = await getCurrentUser();

  return deleteBatch(id, user.id);
}

export async function generateCurrentUserBatchSetups(
  batchId: string,
  workspaceIds?: string[],
): Promise<DraftBatch | null> {
  const user = await getCurrentUser();
  const batch = await getBatchById(batchId, user.id);

  if (!batch) {
    return null;
  }

  const requestedIds = workspaceIds ? new Set(workspaceIds) : null;
  const targets = batch.workspaces.filter(
    (workspace) =>
      (!requestedIds || requestedIds.has(workspace.id)) &&
      ["setup_pending", "setup_generating", "setup_error"].includes(
        workspace.status,
      ),
  );

  await runWithConcurrency(targets, GENERATION_CONCURRENCY, async (workspace) => {
    const claimed = await claimBatchWorkspaceSetup(
      batchId,
      workspace.id,
      user.id,
    );

    if (!claimed) {
      return;
    }

    try {
      const setup = await generateCourseSetup({
        brief: "",
        workspaceId: workspace.id,
      });
      await completeBatchWorkspaceSetup(
        batchId,
        workspace.id,
        user.id,
        setup,
      );
    } catch (error) {
      await failBatchWorkspaceSetup(
        batchId,
        workspace.id,
        user.id,
        errorMessage(error),
      );
    }
  });

  return getBatchById(batchId, user.id);
}

export async function reviewCurrentUserBatchWorkspace(
  batchId: string,
  workspaceId: string,
  setup: CourseSetup,
  attachToKyron: boolean,
): Promise<DraftBatch | null> {
  const user = await getCurrentUser();
  const batch = await getBatchById(batchId, user.id);

  if (!batch) {
    return null;
  }

  const batchWorkspace = batch.workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );

  if (!batchWorkspace) {
    throw new BatchWorkspaceNotFoundError();
  }

  if (attachToKyron && batchWorkspace.sourceFile.type === "docx") {
    throw new BatchValidationError(
      "Only PDF and PPTX files can be attached to a Kyron draft.",
    );
  }

  const input: UpdateDraftWorkspaceRequest = setup;
  const workspace = await updateDraftWorkspace(workspaceId, user.id, input);

  if (!workspace) {
    throw new BatchWorkspaceNotFoundError();
  }

  await updateCurrentWorkspaceSourceFiles(
    workspaceId,
    "kyron_attachment",
    attachToKyron ? [batchWorkspace.sourceFile.id] : [],
  );

  const reviewed = await markBatchWorkspaceReviewed(
    batchId,
    workspaceId,
    user.id,
  );

  if (!reviewed) {
    throw new BatchValidationError(
      "This workspace does not have a generated setup to review.",
    );
  }

  return getBatchById(batchId, user.id);
}

export class BatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchValidationError";
  }
}

export class BatchWorkspaceNotFoundError extends Error {
  constructor() {
    super("Batch workspace was not found.");
    this.name = "BatchWorkspaceNotFoundError";
  }
}

async function runWithConcurrency<Item>(
  items: Item[],
  concurrency: number,
  operation: (item: Item) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await operation(item);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The course setup could not be generated.";
}
