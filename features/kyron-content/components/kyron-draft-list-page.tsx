"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { listKyronContentDrafts } from "@/features/kyron-content/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { KyronContentDraftSummary } from "@/types/api";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; drafts: KyronContentDraftSummary[] };

export function KyronDraftListPage() {
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    listKyronContentDrafts(controller.signal)
      .then(({ drafts }) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", drafts });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "The drafts could not be loaded.") });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={<OpenByIdForm />}
        description="Open a draft to see everything Kyron MCP returns for it, organized by lesson, section, activity and scene, and every change the QA agent made or proposed."
        title="Course content"
      />
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading drafts…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? <DraftTable drafts={state.drafts} /> : null}
    </div>
  );
}

function DraftTable({ drafts }: { drafts: KyronContentDraftSummary[] }) {
  if (drafts.length === 0) {
    return <InlineNotice>No drafts yet. Drafts created from a workspace appear here.</InlineNotice>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Launcher drafts</CardTitle>
        <CardDescription>Newest first. Opening a draft reads it from Kyron; nothing is changed.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid divide-y divide-border/70">
          {drafts.map((draft) => (
            <li key={draft.draftId}>
              <DraftRow draft={draft} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DraftRow({ draft }: { draft: KyronContentDraftSummary }) {
  const qaChanges = draft.qaChangesApplied + draft.qaChangesProposed;

  return (
    <Link
      className="grid gap-2 rounded-lg px-2 py-3 hover:bg-muted/60 sm:grid-cols-[1fr_auto] sm:items-center"
      href={`/kyron/content/${draft.draftId}`}
    >
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-sm font-medium">{draft.name}</span>
        <span className="text-xs text-muted-foreground">
          Draft {draft.draftId} · updated {formatDateTime(draft.updatedAt)}
          {draft.latestRunAt ? ` · last QA run ${formatDateTime(draft.latestRunAt)}` : " · not checked by QA yet"}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge variant={draft.status === "done" ? "success" : draft.status === "error" ? "destructive" : "neutral"}>
          {draft.status === "done" ? "Generated" : draft.status}
        </Badge>
        {!draft.available ? <Badge variant="warning">Not found in Kyron</Badge> : null}
        {qaChanges > 0 ? (
          <Badge variant="info">
            {draft.qaChangesApplied} QA fix{draft.qaChangesApplied === 1 ? "" : "es"}
            {draft.qaChangesProposed > 0 ? ` · ${draft.qaChangesProposed} proposed` : ""}
          </Badge>
        ) : null}
        <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
    </Link>
  );
}

function OpenByIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const valid = /^\d{1,12}$/.test(value.trim()) && Number(value) > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (valid) {
      router.push(`/kyron/content/${value.trim()}`);
    }
  }

  return (
    <form className="flex items-end gap-2" onSubmit={handleSubmit}>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Kyron draft ID
        <Input
          className="w-36"
          inputMode="numeric"
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. 14826"
          value={value}
        />
      </label>
      <Button disabled={!valid} type="submit" variant="outline">
        Open
      </Button>
    </form>
  );
}
