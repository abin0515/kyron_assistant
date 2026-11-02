"use client";

import { Download, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { exportUrl, listLlmUsage } from "@/features/logs/api";
import { LogsPager } from "@/features/logs/components/logs-pager";
import { formatCount, formatTime, formatUsd, messageFromError } from "@/features/logs/components/log-format";
import type { LlmUsageItem, LlmUsageListResponse } from "@/types/api";

type UsageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: LlmUsageListResponse };

export function LogsUsage() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<UsageState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await listLlmUsage(page, controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", result });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Model usage could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [page]);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end gap-2">
        <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("usage", "csv")}>
          <Download aria-hidden="true" />
          CSV
        </a>
        <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("usage", "json")}>
          <Download aria-hidden="true" />
          JSON
        </a>
      </div>
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading model usage…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? (
        <Card>
          <CardContent>
            {state.result.usage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No model calls yet.</p>
            ) : (
              <ul className="grid divide-y divide-border/80">
                {state.result.usage.map((usage) => (
                  <UsageRow key={usage.id} usage={usage} />
                ))}
              </ul>
            )}
            <LogsPager onPage={setPage} pagination={state.result.pagination} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function UsageRow({ usage }: { usage: LlmUsageItem }) {
  return (
    <li className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{formatTime(usage.occurredAt)}</span>
        <span className="font-mono text-xs">{usage.purpose}</span>
        <Badge variant="outline">{usage.model}</Badge>
        {usage.status !== "completed" ? (
          <Badge variant={usage.status === "error" ? "destructive" : "warning"}>
            {usage.status}
            {usage.errorCode ? ` ${usage.errorCode}` : ""}
          </Badge>
        ) : null}
        {usage.qaRunId ? (
          <Link className="text-xs text-primary underline-offset-4 hover:underline" href={`/qa/runs/${usage.qaRunId}`}>
            QA run
          </Link>
        ) : null}
      </div>
      <span className="shrink-0 text-muted-foreground">
        {formatCount(usage.inputTokens)} in{usage.cachedInputTokens > 0 ? ` (${formatCount(usage.cachedInputTokens)} cached)` : ""} /{" "}
        {formatCount(usage.outputTokens)} out
        {usage.reasoningTokens > 0 ? ` (${formatCount(usage.reasoningTokens)} reasoning)` : ""} ·{" "}
        {usage.latencyMs !== null ? `${(usage.latencyMs / 1000).toFixed(1)} s · ` : ""}
        <span className="text-foreground">{formatUsd(usage.status === "error" ? 0 : usage.estimatedCostUsd)}</span>
      </span>
    </li>
  );
}
