"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { exportUrl, listContentVersions } from "@/features/logs/api";
import { LogsPager } from "@/features/logs/components/logs-pager";
import { messageFromError } from "@/features/logs/components/log-format";
import { QaContentVersionList } from "@/features/qa/components/qa-content-versions";
import type { QaContentVersionListResponse } from "@/types/api";

type VersionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: QaContentVersionListResponse };

export function LogsContentVersions() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<VersionsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await listContentVersions(page, controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", result });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Content versions could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [page]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Each version of a course setup or generated lesson: content as read, revisions the QA
          revision agent applied, and revisions it proposed for a person.
        </p>
        <div className="flex gap-2">
          <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("versions", "csv")}>
            <Download aria-hidden="true" />
            CSV
          </a>
          <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("versions", "json")}>
            <Download aria-hidden="true" />
            JSON
          </a>
        </div>
      </div>
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading content versions…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? (
        <Card>
          <CardContent className="grid gap-3">
            <QaContentVersionList showLesson versions={state.result.versions} />
            <LogsPager onPage={setPage} pagination={state.result.pagination} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
