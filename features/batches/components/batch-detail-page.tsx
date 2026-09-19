"use client";

import {
  ArrowLeft,
  ExternalLink,
  Layers3,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  generateBatchSetups,
  getBatch,
  updateBatchWorkspace,
} from "@/features/batches/api";
import { BatchDraftList } from "@/features/batches/components/batch-draft-list";
import { BatchReviewDrawer } from "@/features/batches/components/batch-review-drawer";
import {
  deleteDraftWorkspace,
  submitDraftWorkspace,
  updateWorkspaceKyronDestination,
} from "@/features/drafts/workspaces/api";
import { matchesWorkspaceFilter } from "@/features/batches/status";
import type {
  BatchDraftItem,
  BatchFilter,
  BatchRecord,
} from "@/features/batches/types";
import type { CourseSetup, KyronDestination } from "@/types/api";

const FILTERS: { label: string; value: BatchFilter }[] = [
  { label: "All", value: "all" },
  { label: "Setup generation", value: "pending" },
  { label: "Ready", value: "ready" },
  { label: "In progress", value: "active" },
  { label: "Complete", value: "complete" },
  { label: "Errors", value: "error" },
];
const STALE_GENERATION_MS = 10 * 60 * 1_000;

export function BatchDetailPage({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeFilter, setActiveFilter] = useState<BatchFilter>("all");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [working, setWorking] = useState(false);
  const refreshBatch = useCallback(
    async (signal?: AbortSignal) => {
      const result = await getBatch(batchId, signal);
      setBatch(result);
      return result;
    },
    [batchId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void getBatch(batchId, controller.signal)
      .then(async (result) => {
        setBatch(result);
        const hasGenerationWork = result.workspaces.some(
          (workspace) =>
            workspace.status === "setup_pending" ||
            isStaleGeneration(workspace.status, workspace.updatedAt),
        );

        if (!hasGenerationWork) {
          return;
        }

        setWorking(true);
        setBatch(markSetupsGenerating(result));
        const generated = await generateBatchSetups(
          batchId,
          {},
          controller.signal,
        );
        setBatch(generated);
        setFeedback("Course setup generation finished for the selected files.");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(
            errorMessage(
              loadError,
              "The batch or its course setups could not be loaded.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setWorking(false);
        }
      });

    return () => controller.abort();
  }, [batchId]);

  if (loading) {
    return <PageMessage message="Loading batch…" />;
  }

  if (!batch) {
    return <MissingBatch message={error} />;
  }

  const currentBatch = batch;
  const filteredItems = currentBatch.workspaces.filter((workspace) =>
    matchesWorkspaceFilter(workspace.status, activeFilter),
  );
  const reviewItem =
    currentBatch.workspaces.find((workspace) => workspace.id === reviewId) ?? null;
  const selectedReadyCount = currentBatch.workspaces.filter(
    (workspace) =>
      selectedIds.includes(workspace.id) && workspace.status === "ready",
  ).length;
  const setupErrorIds = currentBatch.workspaces
    .filter((workspace) => workspace.status === "setup_error")
    .map((workspace) => workspace.id);

  async function runGeneration(workspaceIds?: string[]) {
    setWorking(true);
    setError("");
    setBatch((current) =>
      current
        ? {
            ...current,
            workspaces: current.workspaces.map((workspace) =>
              (!workspaceIds || workspaceIds.includes(workspace.id)) &&
              ["setup_pending", "setup_generating", "setup_error"].includes(
                workspace.status,
              )
                ? {
                    ...workspace,
                    status: "setup_generating",
                    statusMessage:
                      "Extracting the source and generating course fields.",
                  }
                : workspace,
            ),
          }
        : current,
    );

    try {
      const result = await generateBatchSetups(
        batchId,
        workspaceIds ? { workspaceIds } : {},
      );
      setBatch(result);
      setFeedback("Course setup generation finished for the selected files.");
    } catch (generationError) {
      setError(
        errorMessage(
          generationError,
          "Course setup generation could not be completed.",
        ),
      );
      await refreshBatch().catch(() => undefined);
    } finally {
      setWorking(false);
    }
  }

  async function saveWorkspaceChanges(
    workspaceId: string,
    setup: CourseSetup,
    attachToKyron: boolean,
    includeInCalibration: boolean,
  ) {
    setWorking(true);
    setError("");
    try {
      setBatch(
        await updateBatchWorkspace(
          batchId,
          workspaceId,
          setup,
          attachToKyron,
          includeInCalibration,
        ),
      );
      setReviewId(null);
      setFeedback("Course setup changes saved.");
    } catch (saveError) {
      setError(errorMessage(saveError, "The course setup could not be saved."));
    } finally {
      setWorking(false);
    }
  }

  async function removeWorkspace(workspaceId: string) {
    if (!window.confirm("Delete this unsubmitted workspace from the batch?")) {
      return;
    }

    setWorking(true);
    setError("");
    try {
      await deleteDraftWorkspace(workspaceId);
      await refreshBatch();
      setSelectedIds((current) => current.filter((id) => id !== workspaceId));
      setFeedback("Workspace deleted from the batch.");
    } catch (deleteError) {
      setError(errorMessage(deleteError, "The workspace could not be deleted."));
    } finally {
      setWorking(false);
    }
  }

  async function saveWorkspaceDestination(
    workspaceId: string,
    destination: KyronDestination,
  ) {
    const saved = await updateWorkspaceKyronDestination(
      workspaceId,
      destination,
    );

    setBatch((current) =>
      current
        ? {
            ...current,
            workspaces: current.workspaces.map((workspace) =>
              workspace.id === workspaceId
                ? {
                    ...workspace,
                    kyronDestination: saved.kyronDestination,
                    updatedAt: saved.recordUpdatedAt,
                  }
                : workspace,
            ),
          }
        : current,
    );
  }

  async function submitSelected() {
    const submissionItems = currentBatch.workspaces.filter(
      (workspace) =>
        selectedIds.includes(workspace.id) && workspace.status === "ready",
    );

    setShowConfirmation(false);
    setWorking(true);
    setError("");
    const results = await Promise.allSettled(
      submissionItems.map((workspace) =>
        submitDraftWorkspace(
          workspace.id,
          workspace.includeInCalibration,
        ),
      ),
    );
    await refreshBatch().catch(() => undefined);
    setSelectedIds([]);
    setWorking(false);

    const failed = results.filter((result) => result.status === "rejected").length;
    setFeedback(
      failed === 0
        ? `Draft creation started for ${submissionItems.length} workspace${submissionItems.length === 1 ? "" : "s"}.`
        : `${submissionItems.length - failed} draft requests started; ${failed} need attention.`,
    );
  }

  function selectVisibleReady(selected: boolean) {
    const visibleReadyIds = filteredItems
      .filter((workspace) => workspace.status === "ready")
      .map((workspace) => workspace.id);

    setSelectedIds((current) =>
      selected
        ? [...new Set([...current, ...visibleReadyIds])]
        : current.filter((id) => !visibleReadyIds.includes(id)),
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          href="/batches"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to batches
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="grid gap-1.5">
            <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
              {batch.name}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Review AI-generated setups and submit ready workspaces independently.
              Each workspace also appears on the Drafts page.
            </p>
          </div>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/drafts"
          >
            View all drafts
            <ExternalLink aria-hidden="true" />
          </Link>
        </div>
      </header>

      {error ? <Message message={error} tone="error" /> : null}
      {feedback ? (
        <Message message={feedback} onClose={() => setFeedback("")} />
      ) : null}

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold">Batch workspaces</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each row is one Draft Workspace created from one source file.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {setupErrorIds.length > 0 ? (
              <Button
                disabled={working}
                onClick={() => void runGeneration(setupErrorIds)}
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Retry failed setups ({setupErrorIds.length})
              </Button>
            ) : null}
            <Button
              disabled={selectedReadyCount === 0 || working}
              onClick={() => setShowConfirmation(true)}
              type="button"
            >
              Create selected drafts ({selectedReadyCount})
            </Button>
          </div>
        </div>

        <BatchFilters
          activeFilter={activeFilter}
          items={batch.workspaces}
          onChange={setActiveFilter}
        />
        <BatchDraftList
          items={filteredItems}
          onEdit={setReviewId}
          onRemove={(id) => void removeWorkspace(id)}
          onRetry={(id) => void runGeneration([id])}
          onSelectionChange={(workspaceId, selected) =>
            setSelectedIds((current) =>
              selected
                ? [...new Set([...current, workspaceId])]
                : current.filter((id) => id !== workspaceId),
            )
          }
          onSelectReady={selectVisibleReady}
          selectedIds={selectedIds}
        />
      </section>

      {reviewItem ? (
        <BatchReviewDrawer
          item={reviewItem}
          key={reviewItem.id}
          onClose={() => setReviewId(null)}
          onDestinationChange={(destination) =>
            saveWorkspaceDestination(reviewItem.id, destination)
          }
          onSave={(setup, attachToKyron, includeInCalibration) =>
            void saveWorkspaceChanges(
              reviewItem.id,
              setup,
              attachToKyron,
              includeInCalibration,
            )
          }
        />
      ) : null}

      {showConfirmation ? (
        <ConfirmationDialog
          count={selectedReadyCount}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={() => void submitSelected()}
        />
      ) : null}
    </div>
  );
}

function BatchFilters({
  activeFilter,
  items,
  onChange,
}: {
  activeFilter: BatchFilter;
  items: BatchDraftItem[];
  onChange: (filter: BatchFilter) => void;
}) {
  return (
    <nav
      aria-label="Workspace status filters"
      className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3"
    >
      {FILTERS.map((filter) => {
        const active = filter.value === activeFilter;
        const count = items.filter((item) =>
          matchesWorkspaceFilter(item.status, filter.value),
        ).length;

        return (
          <button
            aria-pressed={active}
            className={
              active
                ? "flex h-8 shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 text-xs font-semibold text-white"
                : "flex h-8 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
            }
            key={filter.value}
            onClick={() => onChange(filter.value)}
            type="button"
          >
            {filter.label}
            <span className={active ? "text-white/65" : "text-muted-foreground"}>
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ConfirmationDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <section
        aria-labelledby="confirm-batch-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl"
        role="dialog"
      >
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-bold" id="confirm-batch-title">
          Create {count} Kyron draft{count === 1 ? "" : "s"}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Only selected ready workspaces will be submitted. Each request runs
          independently if another one fails.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            Create drafts
          </Button>
        </div>
      </section>
    </div>
  );
}

function Message({
  message,
  onClose,
  tone = "success",
}: {
  message: string;
  onClose?: () => void;
  tone?: "success" | "error";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "flex justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          : "flex justify-between gap-3 rounded-xl border border-[#B9D8C7] bg-[#F3F8F5] px-4 py-3 text-sm text-[#23653F]"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
      {onClose ? (
        <button aria-label="Dismiss message" onClick={onClose} type="button">
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function MissingBatch({ message }: { message: string }) {
  return (
    <div className="grid min-h-96 place-items-center rounded-xl bg-card px-5 text-center ring-1 ring-border">
      <div>
        <Layers3 aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Batch not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message || "This batch does not exist or is not available to this user."}
        </p>
        <Link className={buttonVariants({ className: "mt-5" })} href="/batches">
          Back to batches
        </Link>
      </div>
    </div>
  );
}

function PageMessage({ message }: { message: string }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-xl bg-card text-sm text-muted-foreground ring-1 ring-border">
      {message}
    </div>
  );
}

function markSetupsGenerating(batch: BatchRecord): BatchRecord {
  return {
    ...batch,
    workspaces: batch.workspaces.map((workspace) =>
      workspace.status === "setup_pending"
        ? {
            ...workspace,
            status: "setup_generating",
            statusMessage:
              "Extracting the source and generating course fields.",
          }
        : workspace,
    ),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isStaleGeneration(status: string, updatedAt: string): boolean {
  return (
    status === "setup_generating" &&
    Date.now() - new Date(updatedAt).getTime() >= STALE_GENERATION_MS
  );
}
