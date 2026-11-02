"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { getLogSummary } from "@/features/logs/api";
import { formatCount, formatUsd, messageFromError } from "@/features/logs/components/log-format";
import type { LogSummaryResponse, UsageTotals } from "@/types/api";

type OverviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: LogSummaryResponse };

export function LogsOverview() {
  const [state, setState] = useState<OverviewState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const summary = await getLogSummary(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", summary });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "The summary could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading the summary…
      </p>
    );
  }

  if (state.status === "error") {
    return <InlineNotice tone="error">{state.message}</InlineNotice>;
  }

  const { summary } = state;

  return (
    <div className="grid gap-6">
      <section aria-label="Usage by period" className="grid gap-4 md:grid-cols-3">
        {summary.windows.map((window) => (
          <Card key={window.label} size="sm">
            <CardHeader>
              <CardTitle>{window.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="text-2xl font-light">{formatUsd(window.usage.costUsd)}</p>
              <p className="text-muted-foreground">
                {window.usage.calls} model call(s) · {formatCount(window.usage.inputTokens)} in /{" "}
                {formatCount(window.usage.outputTokens)} out tokens
              </p>
              <p className="text-muted-foreground">
                {window.errorEvents} error event(s) · {window.usage.failedCalls} failed call(s)
                {window.usage.unpricedCalls > 0 ? ` · ${window.usage.unpricedCalls} without a price` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard rows={summary.byModel.map((row) => ({ ...row, label: row.model }))} title="By model (30 days)" />
        <BreakdownCard rows={summary.byPurpose.map((row) => ({ ...row, label: row.purpose }))} title="By purpose (30 days)" />
      </div>
    </div>
  );
}

function BreakdownCard({ rows, title }: { rows: Array<UsageTotals & { label: string }>; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No model calls yet.</p>
        ) : (
          <ul className="grid divide-y divide-border/80 text-sm">
            {rows.map((row) => (
              <li className="flex items-center justify-between gap-3 py-2" key={row.label}>
                <span className="min-w-0 truncate font-mono text-xs">{row.label}</span>
                <span className="shrink-0 text-right text-muted-foreground">
                  {row.calls} call(s) · {formatCount(row.inputTokens + row.outputTokens)} tokens ·{" "}
                  <span className="text-foreground">{formatUsd(row.unpricedCalls === row.calls && row.calls > 0 ? null : row.costUsd)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
