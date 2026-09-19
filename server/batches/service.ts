import "server-only";

import { randomUUID } from "node:crypto";

import {
  createBatchWithWorkspaces,
  deleteBatch,
  getBatchById,
  listBatchesByUser,
} from "@/server/batches/repository";
import type {
  DeleteDraftBatchResult,
} from "@/server/batches/types";
import type {
  PageRequest,
  PageResult,
} from "@/server/http/pagination";
import {
  claimBatchCourseSetupGeneration,
  completeBatchCourseSetupGeneration,
  ensureBatchCourseSetupCalibration,
  failBatchCourseSetupGeneration,
  setBatchCourseSetupCalibrationSelection,
} from "@/server/drafts/course-setup-calibrations/repository";
import { generateCourseSetupWithMetadata } from "@/server/drafts/course-setup/service";
import { updateCurrentWorkspaceSourceFiles } from "@/server/drafts/workspace-source-files/service";
import { updateDraftWorkspace } from "@/server/drafts/workspaces/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import { getSourceFilesByIds } from "@/server/source-files/repository";
import type {
  CourseSetup,
  DraftBatch,
  KyronDestination,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

const MAX_BATCH_WORKSPACES = 20;
const GENERATION_CONCURRENCY = 2;

export async function createCurrentUserBatch(
  name: string,
  sourceFileIds: string[],
  destination: KyronDestination,
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
    destination,
  );

  const batch = await getBatchById(batchId, user.id);

  if (!batch) {
    throw new Error("The created batch could not be loaded.");
  }

  return batch;
}

export async function listCurrentUserBatches(
  page: PageRequest,
): Promise<PageResult<DraftBatch>> {
  const user = await getCurrentUser();

  return listBatchesByUser(user.id, page);
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
    const generationToken = randomUUID();
    const claimed = await claimBatchCourseSetupGeneration(
      batchId,
      workspace.id,
      user.id,
      generationToken,
    );

    if (!claimed) {
      return;
    }

    try {
      const result = await generateCourseSetupWithMetadata({
        brief: "",
        workspaceId: workspace.id,
      });
      const completed = await completeBatchCourseSetupGeneration(
        batchId,
        workspace.id,
        user.id,
        generationToken,
        result,
      );

      if (!completed) {
        throw new Error(
          "The workspace changed while the course setup was being generated.",
        );
      }
    } catch (error) {
      await failBatchCourseSetupGeneration(
        batchId,
        workspace.id,
        user.id,
        generationToken,
        errorMessage(error),
      );
    }
  });

  return getBatchById(batchId, user.id);
}

export async function updateCurrentUserBatchWorkspace(
  batchId: string,
  workspaceId: string,
  setup: CourseSetup,
  attachToKyron: boolean,
  includeInCalibration: boolean,
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

  if (!batchWorkspace.sourceFile) {
    throw new BatchValidationError(
      "This workspace's source file is no longer available in Source Library.",
    );
  }

  if (attachToKyron && batchWorkspace.sourceFile.type === "docx") {
    throw new BatchValidationError(
      "Only PDF and PPTX files can be attached to a Kyron draft.",
    );
  }

  await ensureBatchCourseSetupCalibration(
    batchId,
    workspaceId,
    user.id,
  );

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

  const selectionSaved = await setBatchCourseSetupCalibrationSelection(
    batchId,
    workspaceId,
    user,
    includeInCalibration,
  );

  if (!selectionSaved) {
    throw new BatchValidationError(
      "This workspace does not have a generated setup ready to save.",
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
