import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { DraftStatusBadge } from "@/features/drafts/shared/components/draft-status-badge";
import {
  formatAssetType,
  formatDraftDate,
  formatDuration,
} from "@/features/drafts/shared/format";
import { DeleteWorkspaceButton } from "@/features/drafts/workspaces/components/delete-workspace-button";
import { draftFilterLabel } from "@/features/drafts/workspaces/components/workspace-list-filters";
import type {
  DraftFilter,
  DraftRecord,
} from "@/features/drafts/workspaces/types";
import type { DraftWorkspaceSummary } from "@/types/api";

export function WorkspaceRecords({
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
        <p
          className="border-b border-border bg-card px-5 py-3 text-sm text-primary"
          role="alert"
        >
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
                    <RecordActions onDeleted={onDeleted} record={record} />
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
  return (
    <CardContent className="grid justify-items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <FileText aria-hidden="true" className="size-5" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="font-bold">
          No {draftFilterLabel(filter).toLowerCase()} drafts
        </h2>
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
