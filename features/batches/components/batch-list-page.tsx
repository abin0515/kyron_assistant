"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Clock3,
  FileText,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteBatch,
  listBatches,
} from "@/features/batches/api";
import {
  countCompletedWorkspaces,
  getBatchOverallStatus,
} from "@/features/batches/status";
import type {
  BatchDraftStatus,
  BatchOverallStatus,
  BatchRecord,
} from "@/features/batches/types";
import type { PaginationMeta } from "@/types/api";
import { cn } from "@/lib/utils";

export function BatchListPage() {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    perPage: 25,
    totalCount: 0,
    totalPages: 0,
  });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BatchRecord | null>(null);
  const visibleBatches = batches.filter((batch) =>
    batch.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedBatch =
    visibleBatches.find((batch) => batch.id === selectedId) ??
    visibleBatches[0];

  const loadBatches = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const result = await listBatches(1, signal);
      setBatches(result.batches);
      setPagination(result.pagination);
      setSelectedId((current) =>
        result.batches.some((batch) => batch.id === current)
          ? current
          : (result.batches[0]?.id ?? ""),
      );
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(errorMessage(loadError, "The batch list could not be loaded."));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void listBatches(1, controller.signal)
      .then((result) => {
        setBatches(result.batches);
        setPagination(result.pagination);
        setSelectedId(result.batches[0]?.id ?? "");
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError, "The batch list could not be loaded."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  function handleSelect(batchId: string) {
    setSelectedId(batchId);
    setMobilePreviewOpen(true);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
            Batch drafts
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Select a batch to inspect its workspace progress and open the full
            management view.
          </p>
        </div>
        <Link className={buttonVariants()} href="/batches/new">
          <Plus aria-hidden="true" />
          New batch
        </Link>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid min-h-80 place-items-center rounded-xl bg-card text-sm text-muted-foreground ring-1 ring-border">
          Loading batches…
        </div>
      ) : null}

      {!loading ? <section className="grid min-h-[610px] overflow-hidden rounded-xl bg-card ring-1 ring-border lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={cn(
            "border-border lg:block lg:border-r",
            mobilePreviewOpen ? "hidden" : "block",
          )}
        >
          <div className="border-b border-border p-4">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <span className="sr-only">Search batches</span>
              <Input
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search batches"
                value={query}
              />
            </label>
          </div>

          <div className="max-h-[540px] divide-y divide-border overflow-y-auto">
            {visibleBatches.map((batch) => (
              <BatchNavigatorItem
                active={batch.id === selectedBatch?.id}
                batch={batch}
                key={batch.id}
                onSelect={() => handleSelect(batch.id)}
              />
            ))}
            {visibleBatches.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No matching batches.
              </p>
            ) : null}
            {pagination.page < pagination.totalPages && !query.trim() ? (
              <div className="p-4">
                <Button
                  className="w-full"
                  disabled={loadingMore}
                  onClick={() => void loadMoreBatches()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {loadingMore ? "Loading…" : "Load more batches"}
                </Button>
              </div>
            ) : null}
          </div>
        </aside>

        <div
          className={cn(
            "min-w-0 lg:block",
            mobilePreviewOpen ? "block" : "hidden",
          )}
        >
          {selectedBatch ? (
            <BatchInspector
              batch={selectedBatch}
              onBack={() => setMobilePreviewOpen(false)}
              onDelete={() => setDeleteTarget(selectedBatch)}
            />
          ) : (
            <div className="grid min-h-[420px] place-items-center p-8 text-center">
              <div>
                <FileText
                  aria-hidden="true"
                  className="mx-auto size-7 text-muted-foreground"
                />
                <p className="mt-3 text-sm font-bold">No batch selected</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a batch from the list to inspect it.
                </p>
              </div>
            </div>
          )}
        </div>
      </section> : null}

      {deleteTarget ? (
        <DeleteBatchDialog
          batch={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await deleteBatch(deleteTarget.id);
              setDeleteTarget(null);
              setSelectedId("");
              setMobilePreviewOpen(false);
              setLoading(true);
              await loadBatches();
            } catch (deleteError) {
              setDeleteTarget(null);
              setError(errorMessage(deleteError, "The batch could not be deleted."));
            }
          }}
        />
      ) : null}
    </div>
  );

  async function loadMoreBatches() {
    if (loadingMore || pagination.page >= pagination.totalPages) {
      return;
    }

    setLoadingMore(true);
    setError("");

    try {
      const result = await listBatches(pagination.page + 1);
      setBatches((current) => {
        const existingIds = new Set(current.map((batch) => batch.id));

        return [
          ...current,
          ...result.batches.filter((batch) => !existingIds.has(batch.id)),
        ];
      });
      setPagination(result.pagination);
    } catch (loadError) {
      setError(errorMessage(loadError, "More batches could not be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }
}

function BatchNavigatorItem({
  active,
  batch,
  onSelect,
}: {
  active: boolean;
  batch: BatchRecord;
  onSelect: () => void;
}) {
  const complete = countCompletedWorkspaces(batch);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "grid w-full gap-3 p-4 text-left transition-colors",
        active ? "bg-primary/[0.07]" : "hover:bg-muted/45",
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{batch.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {batch.workspaces.length} workspaces
          </span>
        </span>
        <StatusMark status={getBatchOverallStatus(batch)} />
      </span>
      <span className="grid gap-1.5">
        <span className="flex justify-between text-[0.7rem] text-muted-foreground">
          <span>{complete} complete</span>
          <span>{batch.workspaces.length} total</span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary"
            style={{
              width: `${batch.workspaces.length === 0 ? 0 : (complete / batch.workspaces.length) * 100}%`,
            }}
          />
        </span>
      </span>
    </button>
  );
}

function BatchInspector({
  batch,
  onBack,
  onDelete,
}: {
  batch: BatchRecord;
  onBack: () => void;
  onDelete: () => void;
}) {
  const complete = countCompletedWorkspaces(batch);

  return (
    <div className="min-w-0 p-5 sm:p-6">
      <button
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground lg:hidden"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to batch list
      </button>

      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-[-0.02em]">
              {batch.name}
            </h2>
            <BatchStateBadge status={getBatchOverallStatus(batch)} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {complete} of {batch.workspaces.length} workspaces completed ·
            Updated {formatDate(batch.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onDelete} size="sm" type="button" variant="ghost">
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/batches/${batch.id}`}
          >
            Open batch
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Workspace queue</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Course setup and external generation status by source file.
          </p>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {batch.workspaces.map((workspace) => (
            <div
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
              key={workspace.id}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {workspace.setup.name || sourceFileName(workspace)}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {sourceFileName(workspace)}
                </span>
              </span>
              <WorkspaceState status={workspace.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: BatchOverallStatus }) {
  const config = {
    active: { className: "bg-[#4A809B]", label: "Active" },
    attention: { className: "bg-primary", label: "Needs attention" },
    complete: { className: "bg-[#3C8B63]", label: "Complete" },
  }[status];

  return (
    <span
      aria-label={config.label}
      className={cn("mt-1 size-2.5 rounded-full", config.className)}
      role="img"
    />
  );
}

function BatchStateBadge({ status }: { status: BatchOverallStatus }) {
  const config = {
    active: { icon: Clock3, label: "Active" },
    attention: { icon: TriangleAlert, label: "Needs attention" },
    complete: { icon: CircleCheck, label: "Complete" },
  }[status];
  const Icon = config.icon;

  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

function WorkspaceState({ status }: { status: BatchDraftStatus }) {
  const labels: Record<BatchDraftStatus, string> = {
    complete: "Complete",
    generating: "Generating",
    kyron_error: "Draft error",
    ready: "Ready",
    setup_error: "Setup error",
    setup_generating: "Generating setup",
    setup_pending: "Queued",
    submitting: "Submitting",
  };

  return (
    <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
      {labels[status]}
    </span>
  );
}

function DeleteBatchDialog({
  batch,
  onCancel,
  onConfirm,
}: {
  batch: BatchRecord;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <section
        aria-labelledby="delete-batch-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold" id="delete-batch-title">
              Delete this batch?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This removes <strong>{batch.name}</strong> and its unsubmitted
              workspaces. Submitted workspaces and Kyron drafts remain
              available on the Drafts page.
            </p>
          </div>
          <Button
            aria-label="Close delete confirmation"
            onClick={onCancel}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            Delete batch
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function sourceFileName(workspace: BatchRecord["workspaces"][number]): string {
  return workspace.sourceFile?.name ?? "Source file deleted";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
