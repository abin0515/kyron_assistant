import type { DraftBatch, GenerateDraftBatchRequest } from "@/types/api";

// The rows the server generates a setup for: waiting, still generating (it
// skips one another request is working on) and failed, so opening a batch
// also retries its failed rows, as before.
const GENERATABLE = new Set(["setup_pending", "setup_generating", "setup_error"]);
const CONCURRENCY = 2;
const GENERATING_MESSAGE = "Extracting the source and generating course fields.";

export function setupTargets(batch: DraftBatch, onlyIds?: string[]): string[] {
  return batch.workspaces
    .filter((workspace) => GENERATABLE.has(workspace.status) && (!onlyIds || onlyIds.includes(workspace.id)))
    .map((workspace) => workspace.id);
}

// One request per workspace, two at a time, so each stays well inside the
// platform's time limit (one request for a whole batch did not). A failed
// request does not stop the others: the server records a failed setup on the
// row itself. No new request starts once the signal aborts (the page closed).
// onBatch gets each response with the rows still waiting for theirs.
export async function generateEachSetup({
  batchId,
  generate,
  ids,
  onBatch,
  signal,
}: {
  batchId: string;
  generate: (batchId: string, input: GenerateDraftBatchRequest, signal?: AbortSignal) => Promise<DraftBatch>;
  ids: string[];
  onBatch: (batch: DraftBatch, waitingIds: string[]) => void;
  signal?: AbortSignal;
}): Promise<{ failedRequests: number }> {
  const queue = [...ids];
  const unsettled = new Set(ids);
  let failedRequests = 0;

  async function worker() {
    for (let id = queue.shift(); id !== undefined && !signal?.aborted; id = queue.shift()) {
      try {
        const next = await generate(batchId, { workspaceIds: [id] }, signal);

        unsettled.delete(id);
        onBatch(next, [...unsettled]);
      } catch {
        unsettled.delete(id);

        if (!signal?.aborted) {
          failedRequests += 1;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return { failedRequests };
}

// A response shows the server's state, where rows still in the queue look
// waiting or failed; they keep showing as generating until their turn ends.
export function keepWaitingRowsGenerating(batch: DraftBatch, waitingIds: string[]): DraftBatch {
  return {
    ...batch,
    workspaces: batch.workspaces.map((workspace) =>
      waitingIds.includes(workspace.id) && GENERATABLE.has(workspace.status)
        ? { ...workspace, status: "setup_generating", statusMessage: GENERATING_MESSAGE }
        : workspace,
    ),
  };
}

// What to tell the user once the queue is done, from the rows themselves (a
// request can fail after its row was saved, or stop before it was).
export function generationSummary(
  batch: DraftBatch,
  ids: string[],
): { failed: number; unfinished: number; done: number } {
  const rows = batch.workspaces.filter((workspace) => ids.includes(workspace.id));
  const failed = rows.filter((workspace) => workspace.status === "setup_error").length;
  const unfinished = rows.filter(
    (workspace) => workspace.status === "setup_pending" || workspace.status === "setup_generating",
  ).length;

  return { failed, unfinished, done: rows.length - failed - unfinished };
}
