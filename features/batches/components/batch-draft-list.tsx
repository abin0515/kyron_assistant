"use client";

import {
  CircleCheck,
  FileText,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  BatchDraftItem,
  BatchDraftStatus,
} from "@/features/batches/types";

type BatchDraftListProps = {
  items: BatchDraftItem[];
  selectedIds: string[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onSelectionChange: (id: string, selected: boolean) => void;
  onSelectReady: (selected: boolean) => void;
};

export function BatchDraftList({
  items,
  selectedIds,
  onEdit,
  onRemove,
  onRetry,
  onSelectionChange,
  onSelectReady,
}: BatchDraftListProps) {
  if (items.length === 0) {
    return (
      <div className="grid min-h-52 place-items-center px-5 py-10 text-center">
        <div>
          <FileText
            aria-hidden="true"
            className="mx-auto size-7 text-muted-foreground"
          />
          <h3 className="mt-3 text-sm font-bold">No files in this view</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose another status filter to see the remaining workspaces.
          </p>
        </div>
      </div>
    );
  }

  const readyIds = items
    .filter((item) => item.status === "ready")
    .map((item) => item.id);
  const allReadySelected =
    readyIds.length > 0 && readyIds.every((id) => selectedIds.includes(id));

  return (
    <>
      <div className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <MobileBatchItem
            item={item}
            key={item.id}
            onEdit={onEdit}
            onRemove={onRemove}
            onRetry={onRetry}
            onSelectionChange={onSelectionChange}
            selected={selectedIds.includes(item.id)}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="w-12 px-5 py-3 font-semibold">
                <input
                  aria-label="Select all ready drafts"
                  checked={allReadySelected}
                  className="size-4 accent-primary"
                  disabled={readyIds.length === 0}
                  onChange={(event) => onSelectReady(event.target.checked)}
                  type="checkbox"
                />
              </th>
              <th className="py-3 pr-4 font-semibold">Source file</th>
              <th className="py-3 pr-4 font-semibold">Suggested course</th>
              <th className="py-3 pr-4 font-semibold">Type</th>
              <th className="py-3 pr-4 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <DesktopBatchItem
                item={item}
                key={item.id}
                onEdit={onEdit}
                onRemove={onRemove}
                onRetry={onRetry}
                onSelectionChange={onSelectionChange}
                selected={selectedIds.includes(item.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DesktopBatchItem({
  item,
  selected,
  onEdit,
  onRemove,
  onRetry,
  onSelectionChange,
}: BatchItemProps) {
  return (
    <tr className="align-middle hover:bg-muted/35">
      <td className="px-5 py-4">
        <SelectionCheckbox
          item={item}
          onChange={onSelectionChange}
          selected={selected}
        />
      </td>
      <td className="max-w-60 py-4 pr-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <FileText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold"
              title={item.sourceFile.name}
            >
              {item.sourceFile.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.sourceFile.type.toUpperCase()} ·{" "}
              {formatFileSize(item.sourceFile.size)}
            </p>
          </div>
        </div>
      </td>
      <td className="max-w-64 py-4 pr-4">
        <p className="truncate text-sm font-medium" title={item.setup.name}>
          {item.setup.name || "Course setup not generated"}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.setup.audience || "Audience not confirmed"}
        </p>
      </td>
      <td className="py-4 pr-4 text-sm capitalize">
        <p>{item.setup.assetType}</p>
        <p className="mt-0.5 text-xs normal-case text-muted-foreground">
          {attachmentLabel(item)}
        </p>
      </td>
      <td className="py-4 pr-4">
        <StatusBadge status={item.status} />
        <p className="mt-1 max-w-52 text-xs text-muted-foreground">
          {item.statusMessage}
        </p>
      </td>
      <td className="px-5 py-4">
        <ItemActions
          item={item}
          onEdit={onEdit}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      </td>
    </tr>
  );
}

function MobileBatchItem(props: BatchItemProps) {
  const { item, selected, onEdit, onRemove, onRetry, onSelectionChange } =
    props;

  return (
    <article className="grid gap-4 px-5 py-5">
      <div className="flex items-start gap-3">
        <SelectionCheckbox
          item={item}
          onChange={onSelectionChange}
          selected={selected}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {item.sourceFile.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.sourceFile.type.toUpperCase()} ·{" "}
            {formatFileSize(item.sourceFile.size)} · {attachmentLabel(item)}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div>
        <p className="text-sm font-medium">
          {item.setup.name || "Course setup not generated"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.statusMessage}
        </p>
      </div>
      <ItemActions
        item={item}
        onEdit={onEdit}
        onRemove={onRemove}
        onRetry={onRetry}
      />
    </article>
  );
}

type BatchItemProps = {
  item: BatchDraftItem;
  selected: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onSelectionChange: (id: string, selected: boolean) => void;
};

function SelectionCheckbox({
  item,
  selected,
  onChange,
}: Pick<BatchItemProps, "item" | "selected"> & {
  onChange: BatchItemProps["onSelectionChange"];
}) {
  const selectable = item.status === "ready";

  return (
    <input
      aria-label={`Select ${item.setup.name || item.sourceFile.name}`}
      checked={selectable && selected}
      className="mt-0.5 size-4 shrink-0 accent-primary"
      disabled={!selectable}
      onChange={(event) => onChange(item.id, event.target.checked)}
      type="checkbox"
    />
  );
}

function ItemActions({
  item,
  onEdit,
  onRemove,
  onRetry,
}: Pick<BatchItemProps, "item" | "onEdit" | "onRemove" | "onRetry">) {
  const canEdit = item.status === "ready" || item.status === "needs_review";
  const canRetry = item.status === "setup_error";
  const canViewDetails = [
    "submitting",
    "generating",
    "complete",
    "kyron_error",
  ].includes(item.status);
  const canRemove = [
    "setup_pending",
    "setup_error",
    "needs_review",
    "ready",
  ].includes(item.status);

  return (
    <div className="flex justify-end gap-2">
      {canRetry ? (
        <Button
          onClick={() => onRetry(item.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          onClick={() => onEdit(item.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <PencilLine aria-hidden="true" />
          Review
        </Button>
      ) : null}
      {canViewDetails ? (
        <Link
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
          href={`/drafts/${item.id}`}
        >
          View details
        </Link>
      ) : null}
      {canRemove ? (
        <Button
          aria-label={`Remove ${item.sourceFile.name}`}
          onClick={() => onRemove(item.id)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: BatchDraftStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge className={config.className} variant="outline">
      <Icon
        aria-hidden="true"
        className={config.spin ? "animate-spin" : undefined}
      />
      {config.label}
    </Badge>
  );
}

const STATUS_CONFIG = {
  setup_pending: {
    className: "border-[#C7C9CC] bg-[#F5F5F5] text-[#555B61]",
    icon: FileText,
    label: "Queued",
    spin: false,
  },
  setup_generating: {
    className: "border-[#C7C9CC] bg-[#F5F5F5] text-[#555B61]",
    icon: LoaderCircle,
    label: "Generating setup",
    spin: true,
  },
  setup_error: {
    className: "border-[#E2A7AF] bg-[#FFF4F5] text-[#A32638]",
    icon: TriangleAlert,
    label: "Setup failed",
    spin: false,
  },
  ready: {
    className: "border-[#9BC7B0] bg-[#F0FAF4] text-[#23653F]",
    icon: CircleCheck,
    label: "Ready",
    spin: false,
  },
  needs_review: {
    className: "border-[#DABF7A] bg-[#FFF9E9] text-[#74591D]",
    icon: TriangleAlert,
    label: "Needs review",
    spin: false,
  },
  submitting: {
    className: "border-[#B7ACD9] bg-[#F6F3FF] text-[#59458E]",
    icon: CircleCheck,
    label: "Submitted",
    spin: false,
  },
  generating: {
    className: "border-[#9DBFD0] bg-[#F0F8FC] text-[#295F79]",
    icon: LoaderCircle,
    label: "Generating in Kyron",
    spin: true,
  },
  complete: {
    className: "border-[#9BC7B0] bg-[#F0FAF4] text-[#23653F]",
    icon: CircleCheck,
    label: "Complete",
    spin: false,
  },
  kyron_error: {
    className: "border-[#E2A7AF] bg-[#FFF4F5] text-[#A32638]",
    icon: TriangleAlert,
    label: "Needs attention",
    spin: false,
  },
} satisfies Record<
  BatchDraftStatus,
  {
    className: string;
    icon: typeof CircleCheck;
    label: string;
    spin: boolean;
  }
>;

function formatFileSize(bytes: number): string {
  if (bytes < 1_000_000) {
    return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  }

  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function attachmentLabel(item: BatchDraftItem): string {
  if (item.sourceFile.type === "docx") {
    return "AI only";
  }

  return item.attachToKyron ? "Attachment selected" : "No attachment";
}
