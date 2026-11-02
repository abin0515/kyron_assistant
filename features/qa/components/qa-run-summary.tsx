"use client";

import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { rerunQaRun } from "@/features/qa/api";
import { StageBadge } from "@/features/qa/components/qa-badges";
import {
  ACTIVE_STAGES,
  DOMAIN_LABELS,
  formatDateTime,
  formatTokens,
  messageFromError,
  TARGET_LABELS,
} from "@/features/qa/labels";
import type { QaRunDetailResponse } from "@/types/api";

export function QaRunSummary({ detail }: { detail: QaRunDetailResponse }) {
  const { lesson, run } = detail;
  const active = ACTIVE_STAGES.has(run.stage) || detail.pendingStepCount > 0;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={<RunActions active={active} detail={detail} />}
        description={
          <span>
            {TARGET_LABELS[run.target]} check · {DOMAIN_LABELS[run.domain]} · {SOURCE_LABELS[run.source]} ·
            started {formatDateTime(run.createdAt)} by {run.createdBy}
            {lesson.kyronLessonId ? ` · Kyron lesson ${lesson.kyronLessonId}` : ""}
          </span>
        }
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <StageBadge stage={run.stage} />
            <Badge variant={run.rubricApproved ? "neutral" : "warning"}>
              Rubric {run.rubricVersion}
              {run.rubricApproved ? "" : " (draft)"}
            </Badge>
          </span>
        }
        title={lesson.title}
      />
      <InlineNotice tone={noticeTone(run.stage)}>
        <span className="flex flex-wrap items-center gap-2">
          {active ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {run.stageMessage}
        </span>
      </InlineNotice>
      <p className="text-xs text-muted-foreground">
        Model usage: {run.usage.calls} call(s), {formatTokens(run.usage.inputTokens)} input and{" "}
        {formatTokens(run.usage.outputTokens)} output tokens of a{" "}
        {formatTokens(run.tokenBudget)} budget.
        {detail.contentWritable ? "" : " Fixes are proposed only; this lesson cannot be changed by the agent."}
      </p>
    </div>
  );
}

function RunActions({ active, detail }: { active: boolean; detail: QaRunDetailResponse }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRerun() {
    setWorking(true);
    setError(null);

    try {
      const next = await rerunQaRun(detail.run.id);

      router.push(`/qa/runs/${next.run.id}`);
    } catch (rerunError) {
      setError(messageFromError(rerunError, "The run could not start."));
      setWorking(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        {detail.run.workspaceId ? (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/drafts/${detail.run.workspaceId}`}
          >
            <ExternalLink aria-hidden="true" />
            Open workspace
          </Link>
        ) : null}
        <Button disabled={active || working} onClick={() => void handleRerun()} size="sm" type="button" variant="outline">
          {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
          Run again
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

const SOURCE_LABELS: Record<QaRunDetailResponse["run"]["source"], string> = {
  workspace_setup: "workspace sources",
  manual: "pasted lesson content",
  kyron_mcp: "Kyron MCP",
};

function noticeTone(stage: QaRunDetailResponse["run"]["stage"]) {
  if (stage === "passed" || stage === "verified") {
    return "success" as const;
  }

  if (stage === "blocked" || stage === "error") {
    return "error" as const;
  }

  if (stage === "changes_proposed" || stage === "escalated" || stage === "incomplete") {
    return "warning" as const;
  }

  return "info" as const;
}
