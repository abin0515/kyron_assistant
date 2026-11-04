"use client";

import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DraftApiError } from "@/features/drafts/shared/api-response";
import { getKyronDraftContent, getKyronDraftRevisions } from "@/features/kyron-content/api";
import { currentValues, latestRevisionByKey } from "@/features/kyron-content/revision-status";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import { cn } from "@/lib/utils";
import type { KyronDraftContentResponse, KyronDraftRevisionsResponse } from "@/types/api";

import { DraftContentPanel } from "./draft-content-panel";
import { DraftRevisionsPanel, revisionAnchor } from "./draft-revisions-panel";

export type DraftTab = "content" | "revisions";

type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; notConnected: boolean }
  | { status: "ready"; value: T };

// One Kyron draft: what MCP returns for it (read live) and the QA agent's
// revisions (from the database), on two tabs.
export function KyronDraftPage({ draftId, initialTab }: { draftId: number; initialTab: DraftTab }) {
  const [tab, setTab] = useState<DraftTab>(initialTab);
  const [focus, setFocus] = useState<{ key: string; versionNumber: number } | null>(null);
  const { content, reloadContent, revisions } = useDraftData(draftId);
  const ready = content.status === "ready" ? content.value : null;
  const history = revisions.status === "ready" ? revisions.value : null;
  const revisedKeys = useMemo(() => latestRevisionByKey(history?.versions ?? []), [history]);
  const current = useMemo(() => currentValues(ready), [ready]);

  function selectTab(next: DraftTab) {
    setTab(next);
    window.history.replaceState(null, "", next === "revisions" ? "?tab=revisions" : window.location.pathname);
  }

  function showRevision(key: string, versionNumber: number) {
    setFocus({ key, versionNumber });
    selectTab("revisions");
  }

  useEffect(() => {
    if (tab === "revisions" && focus) {
      document.getElementById(revisionAnchor(focus.key, focus.versionNumber))?.scrollIntoView({ block: "center" });
    }
  }, [focus, tab, history]);

  return (
    <div className="grid gap-6">
      <Link className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/kyron/content">
        <ArrowLeft aria-hidden="true" className="size-4" />
        All drafts
      </Link>
      <PageHeader
        actions={
          <>
            {history?.latestRunId ? (
              <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/qa/runs/${history.latestRunId}`}>
                Latest QA run
              </Link>
            ) : null}
            <Button disabled={content.status === "loading"} onClick={reloadContent} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" />
              Refresh from Kyron
            </Button>
          </>
        }
        description={<HeaderFacts content={ready} draftId={draftId} />}
        title={ready?.name ?? history?.lessonTitle ?? `Kyron draft ${draftId}`}
      />
      <Tabs onSelect={selectTab} revisionCount={countQaChanges(history)} tab={tab} />
      {tab === "content" ? (
        <LoadState errorTitle="Kyron could not be read" label="Reading the draft from Kyron…" state={content}>
          {(value) => <DraftContentPanel content={value} onShowRevision={showRevision} revisedKeys={revisedKeys} />}
        </LoadState>
      ) : (
        <LoadState errorTitle="QA revisions could not be loaded" label="Loading QA revisions…" state={revisions}>
          {(value) => <DraftRevisionsPanel current={current} focus={focus} revisions={value} />}
        </LoadState>
      )}
    </div>
  );
}

function useDraftData(draftId: number) {
  const [content, setContent] = useState<Load<KyronDraftContentResponse>>({ status: "loading" });
  const [revisions, setRevisions] = useState<Load<KyronDraftRevisionsResponse>>({ status: "loading" });
  const [contentKey, setContentKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    load(() => getKyronDraftContent(draftId, controller.signal), setContent, controller.signal);

    return () => controller.abort();
  }, [draftId, contentKey]);

  useEffect(() => {
    const controller = new AbortController();

    load(() => getKyronDraftRevisions(draftId, controller.signal), setRevisions, controller.signal);

    return () => controller.abort();
  }, [draftId]);

  const reloadContent = useCallback(() => {
    setContent({ status: "loading" });
    setContentKey((key) => key + 1);
  }, []);

  return { content, reloadContent, revisions };
}

function load<T>(fetcher: () => Promise<T>, set: (state: Load<T>) => void, signal: AbortSignal) {
  fetcher()
    .then((value) => {
      if (!signal.aborted) {
        set({ status: "ready", value });
      }
    })
    .catch((error: unknown) => {
      if (!signal.aborted) {
        set({
          status: "error",
          message: messageFromError(error, "The request failed."),
          notConnected: error instanceof DraftApiError && error.code === "KYRON_MCP_NOT_CONNECTED",
        });
      }
    });
}

function LoadState<T>({
  children,
  errorTitle,
  label,
  state,
}: {
  children: (value: T) => React.ReactNode;
  errorTitle: string;
  label: string;
  state: Load<T>;
}) {
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {label}
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <InlineNotice tone="error">
        {errorTitle}: {state.message}{" "}
        {state.notConnected ? (
          <Link className="font-medium underline underline-offset-4" href="/kyron">
            Connect Kyron
          </Link>
        ) : null}
      </InlineNotice>
    );
  }

  return <>{children(state.value)}</>;
}

function HeaderFacts({ content, draftId }: { content: KyronDraftContentResponse | null; draftId: number }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>Kyron draft {draftId}</span>
      {content ? (
        <>
          <Badge variant={content.status === "done" ? "success" : "neutral"}>{content.status}</Badge>
          <span>· lock version {content.lockVersion}</span>
          <span>· read {formatDateTime(content.readAt)}</span>
        </>
      ) : null}
    </span>
  );
}

function Tabs({
  onSelect,
  revisionCount,
  tab,
}: {
  onSelect: (tab: DraftTab) => void;
  revisionCount: number | null;
  tab: DraftTab;
}) {
  const items: Array<{ id: DraftTab; label: string }> = [
    { id: "content", label: "From Kyron MCP" },
    { id: "revisions", label: revisionCount === null ? "QA revisions" : `QA revisions (${revisionCount})` },
  ];

  return (
    <div aria-label="Draft views" className="flex gap-1 border-b border-border/80" role="tablist">
      {items.map((item) => (
        <button
          aria-selected={tab === item.id}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function countQaChanges(revisions: KyronDraftRevisionsResponse | null): number | null {
  if (!revisions) {
    return null;
  }

  return revisions.versions
    .filter((version) => version.kind === "qa_applied" || version.kind === "qa_approved" || version.kind === "qa_proposed")
    .reduce((total, version) => total + version.changes.length, 0);
}
