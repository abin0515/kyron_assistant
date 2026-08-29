"use client";

import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  draftFilterDescription,
  draftFilterHeading,
  matchesDraftFilter,
  WorkspaceListFilters,
} from "@/features/drafts/workspaces/components/workspace-list-filters";
import { WorkspaceRecords } from "@/features/drafts/workspaces/components/workspace-records";
import { useWorkspaceRecords } from "@/features/drafts/workspaces/hooks/use-workspace-records";
import type { DraftFilter } from "@/features/drafts/workspaces/types";

export function WorkspaceList() {
  const [activeFilter, setActiveFilter] = useState<DraftFilter>("all");
  const {
    errorMessage,
    hasMore,
    loadMore,
    loading,
    loadingMore,
    records,
    removeRecord,
    synchronizeAll,
    totalCount,
  } = useWorkspaceRecords();

  const filteredRecords = records.filter((record) =>
    matchesDraftFilter(record.status, activeFilter),
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <h1 className="font-heading text-[1.8rem] leading-tight font-light tracking-[-0.025em]">
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

      <WorkspaceListFilters
        activeFilter={activeFilter}
        onChange={setActiveFilter}
        records={records}
      />

      <Card className="min-w-0 gap-0 rounded-xl border-border py-0 ring-1 ring-border">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <div className="grid gap-1">
            <CardTitle className="text-base font-light">
              {draftFilterHeading(activeFilter)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {filteredRecords.length} {draftFilterDescription(activeFilter)} · {records.length} of {totalCount} loaded
            </p>
          </div>
          <Button
            disabled={loading}
            onClick={() => void synchronizeAll()}
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
          onDeleted={removeRecord}
          onShowAll={() => setActiveFilter("all")}
          records={filteredRecords}
        />
        {hasMore ? (
          <div className="border-border flex justify-center border-t px-5 py-4">
            <Button
              disabled={loadingMore}
              onClick={() => void loadMore()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={loadingMore ? "animate-spin" : undefined}
              />
              Load more
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
