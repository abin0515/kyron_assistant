import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/features/qa/components/qa-badges";
import { DOMAIN_LABELS, formatDateTime, TARGET_LABELS } from "@/features/qa/labels";
import type { QaRunSummary } from "@/types/api";

export function QaRunList({ runs }: { runs: QaRunSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent quality checks</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checks yet. Generating a course setup on a draft workspace starts one automatically.
          </p>
        ) : (
          <ul className="grid divide-y divide-border/80">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: QaRunSummary }) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1">
        <p className="truncate font-medium">{run.title}</p>
        <p className="text-xs text-muted-foreground">
          {TARGET_LABELS[run.target]} · {DOMAIN_LABELS[run.domain]} · {formatDateTime(run.createdAt)}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StageBadge stage={run.stage} />
          <span className="text-muted-foreground">
            {run.blockingFindings} blocking of {run.totalFindings} finding(s)
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {run.workspaceId ? (
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            href={`/drafts/${run.workspaceId}`}
          >
            Open workspace
          </Link>
        ) : null}
        <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/qa/runs/${run.id}`}>
          View report
        </Link>
      </div>
    </li>
  );
}
