import { describe, expect, it } from "vitest";

import {
  generateEachSetup,
  generationSummary,
  keepWaitingRowsGenerating,
  setupTargets,
} from "@/features/batches/generation-queue";
import type { BatchWorkspaceItem, DraftBatch } from "@/types/api";

function batch(statuses: Array<[string, BatchWorkspaceItem["status"]]>): DraftBatch {
  return {
    id: "batch-1",
    name: "Batch",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
    workspaces: statuses.map(([id, status]) => ({ id, status }) as BatchWorkspaceItem),
  };
}

describe("generating a batch's course setups", () => {
  it("targets the rows the server generates: waiting, generating and failed", () => {
    const current = batch([
      ["a", "setup_pending"],
      ["b", "setup_generating"],
      ["c", "setup_error"],
      ["d", "ready"],
      ["e", "generating"],
    ]);

    expect(setupTargets(current)).toEqual(["a", "b", "c"]);
    expect(setupTargets(current, ["c", "d"])).toEqual(["c"]);
  });

  it("sends one request per workspace, two at a time, and keeps going past a failed one", async () => {
    const sent: string[][] = [];
    let running = 0;
    let mostAtOnce = 0;
    const waiting: string[][] = [];

    const result = await generateEachSetup({
      batchId: "batch-1",
      ids: ["a", "b", "c", "d"],
      onBatch: (_next, waitingIds) => waiting.push(waitingIds),
      generate: async (_batchId, input) => {
        sent.push(input.workspaceIds ?? []);
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;

        if (input.workspaceIds?.[0] === "b") {
          throw new Error("504");
        }

        return batch([[input.workspaceIds?.[0] ?? "", "ready"]]);
      },
    });

    expect(sent.flat().sort()).toEqual(["a", "b", "c", "d"]);
    expect(sent.every((ids) => ids.length === 1)).toBe(true);
    expect(mostAtOnce).toBe(2);
    expect(result).toEqual({ failedRequests: 1 });
    expect(waiting).toHaveLength(3);
    // The last response comes when nothing else is waiting.
    expect(waiting.at(-1)).toEqual([]);
  });

  it("starts no new request once the page is closed", async () => {
    const controller = new AbortController();
    const sent: string[] = [];

    await generateEachSetup({
      batchId: "batch-1",
      ids: ["a", "b", "c", "d", "e"],
      onBatch: () => undefined,
      signal: controller.signal,
      generate: async (_batchId, input) => {
        sent.push(input.workspaceIds?.[0] ?? "");
        await new Promise((resolve) => setTimeout(resolve, 1));
        // The page closes while the first two requests are running.
        controller.abort();

        return batch([]);
      },
    });

    expect(sent).toEqual(["a", "b"]);
  });

  it("reports from the rows' final statuses, counting interrupted ones as unfinished", () => {
    const final = batch([
      ["a", "ready"],
      ["b", "setup_error"],
      ["c", "ready"],
      ["d", "setup_generating"],
      ["x", "setup_error"],
    ]);

    expect(generationSummary(final, ["a", "b", "c", "d"])).toEqual({ failed: 1, unfinished: 1, done: 2 });
  });

  it("keeps rows still in the queue showing as generating between responses", () => {
    const shown = keepWaitingRowsGenerating(
      batch([
        ["a", "ready"],
        ["b", "setup_error"],
        ["c", "setup_pending"],
        ["d", "setup_error"],
      ]),
      ["b", "c"],
    );

    expect(shown.workspaces.map((workspace) => workspace.status)).toEqual([
      "ready",
      "setup_generating",
      "setup_generating",
      "setup_error",
    ]);
  });
});
