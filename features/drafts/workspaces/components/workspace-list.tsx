"use client";

import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listDrafts,
  syncDrafts,
} from "@/features/drafts/kyron-drafts/api";
import {
  DraftStatusBadge,
  type DisplayDraftStatus,
} from "@/features/drafts/shared/components/draft-status-badge";
import {
  formatAssetType,
  formatDraftDate,
  formatDuration,
} from "@/features/drafts/shared/format";
import { DeleteWorkspaceButton } from "@/features/drafts/workspaces/components/delete-workspace-button";
import { listDraftWorkspaces } from "@/features/drafts/workspaces/api";
import type {
  DraftWorkspaceSummary,
  ManagedDraft,
} from "@/types/api";

type DraftRecord = {
  draft: ManagedDraft | null;
  status: DisplayDraftStatus;
  workspace: DraftWorkspaceSummary;
};

type DraftFilter =
  | "all"
  | "editing"
  | "generating"
  | "complete"
  | "attention";

const DRAFT_FILTERS: { label: string; value: DraftFilter }[] = [
  { label: "All", value: "all" },
  { label: "Editing", value: "editing" },
  { label: "In progress", value: "generating" },
  { label: "Complete", value: "complete" },
  { label: "Needs attention", value: "attention" },
];

export function WorkspaceList() {
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [activeFilter, setActiveFilter] = useState<DraftFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DraftRecord[]>([]);

  const filteredRecords = records.filter((record) =>
    matchesFilter(record.status, activeFilter),
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadRecords(controller.signal, false)
      .then(setRecords)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setErrorMessage(messageFromError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      refreshControllerRef.current?.abort();
    },
    [],
  );

  async function handleRefresh() {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setErrorMessage(null);
    setLoading(true);

    try {
      const nextRecords = await loadRecords(controller.signal, true);

      if (!controller.signal.aborted) {
        setRecords(nextRecords);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      if (refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
            Drafts
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review saved course setups and follow submitted drafts through
            generation.
          </p>
        </div>
        <Link
          className={buttonVariants({
            className: "min-h-10 px-4 font-semibold",
            size: "lg",
          })}
          href="/drafts/new"
        >
          <Plus aria-hidden="true" />
          New draft
        </Link>
      </header>

      <DraftStatusFilters
        activeFilter={activeFilter}
        onChange={setActiveFilter}
        records={records}
      />

      <Card className="min-w-0 gap-0 rounded-xl border-border py-0 ring-1 ring-border">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <div className="grid gap-1">
            <CardTitle className="text-base font-bold">
              {filterHeading(activeFilter)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {filteredRecords.length} {filterDescription(activeFilter)}
            </p>
          </div>
          <Button
            disabled={loading}
            onClick={() => void handleRefresh()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        </CardHeader>

        <WorkspaceRecords
          errorMessage={errorMessage}
          filter={activeFilter}
          hasSavedDrafts={records.length > 0}
          loading={loading}
          onDeleted={(workspaceId) =>
            setRecords((current) =>
              current.filter(
                (record) => record.workspace.id !== workspaceId,
              ),
            )
          }
          onShowAll={() => setActiveFilter("all")}
          records={filteredRecords}
        />
      </Card>
    </div>
  );
}

function DraftStatusFilters({
  activeFilter,
  onChange,
  records,
}: {
  activeFilter: DraftFilter;
  onChange: (filter: DraftFilter) => void;
  records: DraftRecord[];
}) {
  return (
    <nav
      aria-label="Draft status filters"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {DRAFT_FILTERS.map((filter) => {
        const active = filter.value === activeFilter;
        const count = filterCount(records, filter.value);

        return (
          <button
            aria-pressed={active}
            className={
              active
                ? "flex h-9 shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-semibold text-primary-foreground"
                : "flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-secondary-foreground"
            }
            key={filter.value}
            onClick={() => onChange(filter.value)}
            type="button"
          >
            {filter.label}
            <span
              className={
                active
                  ? "text-xs text-primary-foreground/70"
                  : "text-xs text-muted-foreground"
              }
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

async function loadRecords(
  signal: AbortSignal,
  synchronize: boolean,
): Promise<DraftRecord[]> {
  const [workspaceResponse, draftResponse] = await Promise.all([
    listDraftWorkspaces(signal),
    synchronize ? syncDrafts(signal) : listDrafts(signal),
  ]);
  const draftsById = new Map(
    draftResponse.drafts.map((draft) => [draft.id, draft]),
  );

  return workspaceResponse.workspaces.map((workspace) => {
    const draft = workspace.kyronDraftId
      ? (draftsById.get(workspace.kyronDraftId) ?? null)
      : null;

    return {
      draft,
      status: displayStatus(workspace, draft),
      workspace,
    };
  });
}

function WorkspaceRecords({
  errorMessage,
  filter,
  hasSavedDrafts,
  loading,
  onDeleted,
  onShowAll,
  records,
}: {
  errorMessage: string | null;
  filter: DraftFilter;
  hasSavedDrafts: boolean;
  loading: boolean;
  onDeleted: (workspaceId: string) => void;
  onShowAll: () => void;
  records: DraftRecord[];
}) {
  if (loading && records.length === 0) {
    return <LoadingState />;
  }

  if (errorMessage && records.length === 0) {
    return <ErrorState errorMessage={errorMessage} />;
  }

  if (records.length === 0) {
    return hasSavedDrafts ? (
      <FilteredEmptyState filter={filter} onShowAll={onShowAll} />
    ) : (
      <EmptyState />
    );
  }

  return (
    <>
      {errorMessage ? (
        <p className="border-b border-border bg-[#FFF5F6] px-5 py-3 text-sm text-primary" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="divide-y divide-border md:hidden">
        {records.map((record) => (
          <MobileDraftRecord
            key={record.workspace.id}
            onDeleted={onDeleted}
            record={record}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-5 py-3 font-semibold">Draft</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-5 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => (
              <tr className="h-14 hover:bg-muted/30" key={record.workspace.id}>
                <td className="max-w-[340px] px-5 py-3 font-medium">
                  <span className="block truncate">
                    {record.workspace.name || "Untitled draft"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-secondary-foreground">
                  {formatAssetType(record.workspace.assetType)} ·{" "}
                  {formatDuration(record.workspace.duration)}
                </td>
                <td className="px-4 py-3">
                  <DraftStatusBadge status={record.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatDraftDate(record.workspace.recordUpdatedAt)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <RecordActions
                      onDeleted={onDeleted}
                      record={record}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function filterCount(records: DraftRecord[], filter: DraftFilter): number {
  return records.filter((record) => matchesFilter(record.status, filter))
    .length;
}

function matchesFilter(
  status: DisplayDraftStatus,
  filter: DraftFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "attention") {
    return status === "attention" || status === "not_found";
  }

  return status === filter;
}

function filterDescription(filter: DraftFilter): string {
  const label = DRAFT_FILTERS.find((item) => item.value === filter)?.label;

  return filter === "all" ? "saved drafts" : `${label?.toLowerCase()} drafts`;
}

function filterHeading(filter: DraftFilter): string {
  const label = DRAFT_FILTERS.find((item) => item.value === filter)?.label;

  return `${label} drafts`;
}

function MobileDraftRecord({
  onDeleted,
  record,
}: {
  onDeleted: (workspaceId: string) => void;
  record: DraftRecord;
}) {
  return (
    <article className="grid gap-3 px-5 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {record.workspace.name || "Untitled draft"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatAssetType(record.workspace.assetType)} ·{" "}
            {formatDuration(record.workspace.duration)}
          </p>
        </div>
        <DraftStatusBadge status={record.status} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {formatDraftDate(record.workspace.recordUpdatedAt)}
        </span>
        <RecordActions onDeleted={onDeleted} record={record} />
      </div>
    </article>
  );
}

function RecordActions({
  onDeleted,
  record,
}: {
  onDeleted: (workspaceId: string) => void;
  record: DraftRecord;
}) {
  const { draft, status, workspace } = record;

  if (
    (status === "complete" || status === "attention") &&
    draft?.kyronAvailability === "available"
  ) {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "attention" ? (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/drafts/${workspace.id}`}
          >
            View details
          </Link>
        ) : null}
        <Button
          nativeButton={false}
          render={
            <a href={draft.previewUrl} rel="noreferrer" target="_blank" />
          }
          size="sm"
          variant="outline"
        >
          Preview
          <ExternalLink aria-hidden="true" />
        </Button>
        <Button
          nativeButton={false}
          render={
            <a href={draft.editorUrl} rel="noreferrer" target="_blank" />
          }
          size="sm"
        >
          Open editor
          <ExternalLink aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        className={buttonVariants({ size: "sm", variant: "outline" })}
        href={`/drafts/${workspace.id}`}
      >
        {status === "editing" ? "Continue" : "View details"}
      </Link>
      {canDeleteWorkspace(workspace) ? (
        <DeleteWorkspaceButton
          onDeleted={() => onDeleted(workspace.id)}
          workspaceId={workspace.id}
        />
      ) : null}
    </div>
  );
}

function canDeleteWorkspace(workspace: DraftWorkspaceSummary): boolean {
  return (
    !workspace.kyronDraftId &&
    (workspace.status === "editing" || workspace.status === "error")
  );
}

function displayStatus(
  workspace: DraftWorkspaceSummary,
  draft: ManagedDraft | null,
): DisplayDraftStatus {
  if (draft?.kyronAvailability === "unavailable") {
    return "not_found";
  }

  if (draft?.status === "done") {
    return "complete";
  }

  if (draft?.status === "error" || workspace.status === "error") {
    return "attention";
  }

  if (
    draft?.status === "started" ||
    workspace.status === "submitting" ||
    workspace.status === "submitted"
  ) {
    return "generating";
  }

  return "editing";
}

function LoadingState() {
  return (
    <CardContent className="flex items-center gap-3 px-6 py-12 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      Loading saved drafts…
    </CardContent>
  );
}

function ErrorState({ errorMessage }: { errorMessage: string }) {
  return (
    <CardContent className="grid gap-2 px-6 py-12">
      <h2 className="font-bold">Drafts unavailable</h2>
      <p className="text-sm text-primary" role="alert">
        {errorMessage}
      </p>
    </CardContent>
  );
}

function EmptyState() {
  return (
    <CardContent className="grid justify-items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <FileText aria-hidden="true" className="size-5" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="font-bold">No saved drafts yet</h2>
        <p className="text-sm text-muted-foreground">
          Create a workspace now and return to it whenever you need.
        </p>
      </div>
      <Link className={buttonVariants()} href="/drafts/new">
        <Plus aria-hidden="true" />
        New draft
      </Link>
    </CardContent>
  );
}

function FilteredEmptyState({
  filter,
  onShowAll,
}: {
  filter: DraftFilter;
  onShowAll: () => void;
}) {
  const label = DRAFT_FILTERS.find((item) => item.value === filter)?.label;

  return (
    <CardContent className="grid justify-items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <FileText aria-hidden="true" className="size-5" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="font-bold">No {label?.toLowerCase()} drafts</h2>
        <p className="text-sm text-muted-foreground">
          No saved workspace currently matches this status.
        </p>
      </div>
      <Button onClick={onShowAll} type="button" variant="outline">
        Show all drafts
      </Button>
    </CardContent>
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft records could not be loaded.";
}
