"use client";

import {
  CircleCheck,
  Info,
  Layers3,
  LoaderCircle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BatchDraftList } from "@/features/batches/components/batch-draft-list";
import { BatchReviewDrawer } from "@/features/batches/components/batch-review-drawer";
import { BatchUploadZone } from "@/features/batches/components/batch-upload-zone";
import {
  createSampleBatch,
  createSetupFromFileName,
} from "@/features/batches/sample-data";
import type {
  BatchCourseSetup,
  BatchDraftItem,
  BatchDraftStatus,
  BatchFilter,
} from "@/features/batches/types";

const FILTERS: { label: string; value: BatchFilter }[] = [
  { label: "All", value: "all" },
  { label: "Ready", value: "ready" },
  { label: "Needs review", value: "needs_review" },
  { label: "In progress", value: "active" },
  { label: "Complete", value: "complete" },
  { label: "Errors", value: "error" },
];

export function BatchConcept() {
  const timersRef = useRef<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<BatchFilter>("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [items, setItems] = useState<BatchDraftItem[]>(createSampleBatch);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const filteredItems = items.filter((item) =>
    matchesFilter(item.status, activeFilter),
  );
  const reviewItem = items.find((item) => item.id === reviewId) ?? null;
  const selectedReadyCount = items.filter(
    (item) => selectedIds.includes(item.id) && item.status === "ready",
  ).length;

  useEffect(() => {
    const timers = timersRef.current;
    const initialAnalysisTimer = window.setTimeout(() => {
      completeAnalysis("sample-lab-safety");
    }, 1_500);
    timers.push(initialAnalysisTimer);

    return () => timers.forEach(window.clearTimeout);
  }, []);

  function handleFilesAdded(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const newItems = files.map(createItemFromFile);
    setItems((current) => [...newItems, ...current]);
    setActiveFilter("all");
    setFeedback(
      `${files.length} file${files.length === 1 ? "" : "s"} added to the concept batch.`,
    );

    newItems
      .filter((item) => item.status === "processing")
      .forEach((item) => scheduleAnalysis(item.id));
  }

  function handleLoadSample() {
    clearTimers();
    setItems(createSampleBatch());
    setSelectedIds([]);
    setReviewId(null);
    setActiveFilter("all");
    setFeedback("Sample batch restored.");
    scheduleAnalysis("sample-lab-safety");
  }

  function handleRemove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
    setReviewId((current) => (current === id ? null : current));
  }

  function handleRetry(id: string) {
    updateItem(id, {
      status: "processing",
      statusMessage: "Trying the source analysis again.",
    });
    scheduleAnalysis(id);
  }

  function handleSaveReview(id: string, setup: BatchCourseSetup) {
    updateItem(id, {
      setup,
      status: "ready",
      statusMessage: "Course setup reviewed and ready to create.",
    });
    setReviewId(null);
    setFeedback("Course setup saved and marked ready.");
  }

  function handleSelectionChange(id: string, selected: boolean) {
    setSelectedIds((current) =>
      selected
        ? Array.from(new Set([...current, id]))
        : current.filter((selectedId) => selectedId !== id),
    );
  }

  function handleSelectReady(selected: boolean) {
    const visibleReadyIds = filteredItems
      .filter((item) => item.status === "ready")
      .map((item) => item.id);

    setSelectedIds((current) =>
      selected
        ? Array.from(new Set([...current, ...visibleReadyIds]))
        : current.filter((id) => !visibleReadyIds.includes(id)),
    );
  }

  function handleConfirmCreation() {
    const submissionIds = items
      .filter((item) => selectedIds.includes(item.id) && item.status === "ready")
      .map((item) => item.id);

    setShowConfirmation(false);
    setSelectedIds([]);
    setFeedback(
      `Demo started for ${submissionIds.length} draft${submissionIds.length === 1 ? "" : "s"}. No API requests were sent.`,
    );
    updateStatuses(
      submissionIds,
      "submitting",
      "Sending reviewed course setup to the creation service.",
    );

    scheduleStatus(
      submissionIds,
      "generating",
      "Draft accepted and content generation is in progress.",
      900,
    );
    scheduleStatus(
      submissionIds,
      "complete",
      "Draft generation completed in this simulated workflow.",
      3_000,
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
              Batch drafts
            </h1>
            <Badge className="border-primary/25 bg-[#FFF0F2] text-primary" variant="outline">
              Concept
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Explore how multiple source files could become reviewed course
            setups and independently generated drafts.
          </p>
        </div>
      </header>

      <ConceptNotice />
      <BatchSummary items={items} />
      <BatchUploadZone
        onFilesAdded={handleFilesAdded}
        onLoadSample={handleLoadSample}
      />

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold">Batch queue</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review AI suggestions, choose ready items, then simulate creation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={items.length === 0}
              onClick={() => {
                clearTimers();
                setItems([]);
                setSelectedIds([]);
                setReviewId(null);
                setFeedback("Batch cleared.");
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              Clear batch
            </Button>
            <Button
              disabled={selectedReadyCount === 0}
              onClick={() => setShowConfirmation(true)}
              size="lg"
              type="button"
            >
              <Sparkles aria-hidden="true" />
              Create selected drafts ({selectedReadyCount})
            </Button>
          </div>
        </div>

        {feedback ? (
          <div
            className="flex items-start justify-between gap-3 border-b border-border bg-[#F3F8F5] px-5 py-3 text-sm text-[#23653F]"
            role="status"
          >
            <span>{feedback}</span>
            <button
              aria-label="Dismiss message"
              className="shrink-0"
              onClick={() => setFeedback(null)}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}

        <BatchFilters
          activeFilter={activeFilter}
          items={items}
          onChange={setActiveFilter}
        />
        <BatchDraftList
          items={filteredItems}
          onEdit={setReviewId}
          onRemove={handleRemove}
          onRetry={handleRetry}
          onSelectionChange={handleSelectionChange}
          onSelectReady={handleSelectReady}
          selectedIds={selectedIds}
        />
      </section>

      <Assumptions />

      {reviewItem ? (
        <BatchReviewDrawer
          item={reviewItem}
          key={reviewItem.id}
          onClose={() => setReviewId(null)}
          onSave={(setup) => handleSaveReview(reviewItem.id, setup)}
        />
      ) : null}

      {showConfirmation ? (
        <ConfirmationDialog
          count={selectedReadyCount}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={handleConfirmCreation}
        />
      ) : null}
    </div>
  );

  function scheduleAnalysis(id: string) {
    const timer = window.setTimeout(() => {
      completeAnalysis(id);
    }, 1_200);

    timersRef.current.push(timer);
  }

  function completeAnalysis(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              setup: createSetupFromFileName(item.fileName),
              status: "ready",
              statusMessage: "Course setup is ready to review.",
            }
          : item,
      ),
    );
  }

  function scheduleStatus(
    ids: string[],
    status: BatchDraftStatus,
    statusMessage: string,
    delay: number,
  ) {
    const timer = window.setTimeout(
      () => updateStatuses(ids, status, statusMessage),
      delay,
    );
    timersRef.current.push(timer);
  }

  function updateStatuses(
    ids: string[],
    status: BatchDraftStatus,
    statusMessage: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        ids.includes(item.id) ? { ...item, status, statusMessage } : item,
      ),
    );
  }

  function updateItem(id: string, changes: Partial<BatchDraftItem>) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    );
  }

  function clearTimers() {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current.length = 0;
  }
}

function ConceptNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#DABF7A] bg-[#FFF9E9] px-4 py-3 text-sm text-[#604A18]">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Concept preview:</strong> this page uses local sample data. It
        does not upload files, call AI, save records, or create external drafts.
      </p>
    </div>
  );
}

function BatchSummary({ items }: { items: BatchDraftItem[] }) {
  const summary = useMemo(
    () => [
      {
        icon: <Layers3 aria-hidden="true" />,
        label: "Source files",
        value: items.length,
      },
      {
        icon: <CircleCheck aria-hidden="true" />,
        label: "Ready",
        value: countStatus(items, "ready"),
      },
      {
        icon: <Info aria-hidden="true" />,
        label: "Needs review",
        value: countStatus(items, "needs_review"),
      },
      {
        icon: <LoaderCircle aria-hidden="true" />,
        label: "Active",
        value: items.filter((item) => matchesFilter(item.status, "active")).length,
      },
    ],
    [items],
  );

  return (
    <section aria-label="Batch summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map((item) => (
        <div
          className="flex items-start justify-between rounded-xl bg-card px-4 py-4 ring-1 ring-border"
          key={item.label}
        >
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">
              {item.value}
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
            {item.icon}
          </span>
        </div>
      ))}
    </section>
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
      aria-label="Batch status filters"
      className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3"
    >
      {FILTERS.map((filter) => {
        const active = filter.value === activeFilter;
        const count = items.filter((item) =>
          matchesFilter(item.status, filter.value),
        ).length;

        return (
          <button
            aria-pressed={active}
            className={
              active
                ? "flex h-8 shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 text-xs font-semibold text-white"
                : "flex h-8 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground"
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

function Assumptions() {
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-sm font-bold">Assumptions to validate with the team</h2>
      <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <li>• One PDF or PPTX file creates one draft.</li>
        <li>• AI suggests setup fields before submission.</li>
        <li>• A teammate reviews each setup before creation.</li>
        <li>• Files run independently and can be retried separately.</li>
        <li>• One failed file does not stop the rest of the batch.</li>
        <li>• Original files may also be attached to created drafts.</li>
      </ul>
    </section>
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <section
        aria-labelledby="confirm-batch-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl"
        role="dialog"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-[#FFF0F2] text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-bold" id="confirm-batch-title">
          Simulate creating {count} draft{count === 1 ? "" : "s"}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This demonstrates the proposed workflow only. No files, database
          records, AI requests, or external drafts will be created.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            Run demo
          </Button>
        </div>
      </section>
    </div>
  );
}

function createItemFromFile(file: File): BatchDraftItem {
  const supported = /\.(pdf|pptx)$/i.test(file.name);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    status: supported ? "processing" : "error",
    statusMessage: supported
      ? "Analyzing source material and suggesting course fields."
      : "Only PDF and PPTX files are supported in this concept.",
    setup: createSetupFromFileName(file.name),
  };
}

function matchesFilter(
  status: BatchDraftStatus,
  filter: BatchFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return ["processing", "submitting", "generating"].includes(status);
  }

  return status === filter;
}

function countStatus(
  items: BatchDraftItem[],
  status: BatchDraftStatus,
): number {
  return items.filter((item) => item.status === status).length;
}
