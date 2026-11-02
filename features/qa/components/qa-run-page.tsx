"use client";

import { LoaderCircle } from "lucide-react";

import { InlineNotice } from "@/components/ui/inline-notice";
import { QaAuditPanel } from "@/features/qa/components/qa-audit-panel";
import { QaContentVersionsPanel } from "@/features/qa/components/qa-content-versions";
import { QaCoveragePanel } from "@/features/qa/components/qa-coverage-panel";
import { QaFindingList } from "@/features/qa/components/qa-finding-list";
import { QaHumanChecksPanel } from "@/features/qa/components/qa-human-checks-panel";
import { QaMediaPanel } from "@/features/qa/components/qa-media-panel";
import { QaRunActivity } from "@/features/qa/components/qa-run-activity";
import { QaRunSummary } from "@/features/qa/components/qa-run-summary";
import { useQaRun } from "@/features/qa/hooks/use-qa-run";

export function QaRunPage({ isAdmin, runId }: { isAdmin: boolean; runId: string }) {
  const { applyDetail, state } = useQaRun(runId);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading the QA run…
      </p>
    );
  }

  if (state.status === "error") {
    return <InlineNotice tone="error">{state.message}</InlineNotice>;
  }

  const { detail } = state;

  return (
    <div className="grid gap-6">
      <QaRunSummary detail={detail} />
      {state.advanceError ? (
        <InlineNotice tone="warning">
          {state.advanceError} Retrying automatically.
        </InlineNotice>
      ) : null}
      {detail.run.audit.required ? (
        <QaAuditPanel isAdmin={isAdmin} onChanged={applyDetail} run={detail.run} />
      ) : null}
      <QaFindingList detail={detail} isAdmin={isAdmin} onChanged={applyDetail} />
      <QaCoveragePanel detail={detail} />
      <div className="grid gap-6 lg:grid-cols-2">
        <QaMediaPanel detail={detail} onChanged={applyDetail} />
        <QaHumanChecksPanel isAdmin={isAdmin} onChanged={applyDetail} run={detail.run} />
      </div>
      <QaContentVersionsPanel detail={detail} />
      <QaRunActivity detail={detail} />
    </div>
  );
}
