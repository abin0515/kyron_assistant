"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { getQaMetrics, listQaRuns } from "@/features/qa/api";
import { QaMetricsCards } from "@/features/qa/components/qa-metrics-cards";
import { QaRunList } from "@/features/qa/components/qa-run-list";
import { messageFromError } from "@/features/qa/labels";
import type { QaMetricsResponse, QaRunSummary } from "@/types/api";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: QaRunSummary[]; metrics: QaMetricsResponse };

export function QaDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [{ runs }, metrics] = await Promise.all([
          listQaRuns(controller.signal),
          getQaMetrics(controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setState({ status: "ready", runs, metrics });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "QA data could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Quality checks run inside course generation: each course setup is checked and fixed before Kyron builds it, and each generated lesson is checked once Kyron finishes. This page shows them across workspaces."
        title="QA agent"
      />

      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading quality checks…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? (
        <>
          <QaMetricsCards metrics={state.metrics} />
          <QaRunList runs={state.runs} />
        </>
      ) : null}
    </div>
  );
}
