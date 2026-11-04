"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { listQaEscalations } from "@/features/qa/api";
import { SeverityBadge } from "@/features/qa/components/qa-badges";
import { DOMAIN_LABELS, formatDateTime, messageFromError } from "@/features/qa/labels";
import type { QaEscalation } from "@/types/api";

type EscalationState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; escalations: QaEscalation[] };

export function QaEscalationsPage() {
  const [state, setState] = useState<EscalationState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const { escalations } = await listQaEscalations(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", escalations });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Escalations could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Findings the agent could not fix on its own: concurrent edits in Kyron, problems with no automatic fix, and fixes that failed twice. Every other fix is applied automatically. Open the run to accept, reject or waive each one."
        title="Escalations"
      />
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading escalations…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" && state.escalations.length === 0 ? (
        <InlineNotice tone="success">Nothing is waiting for a decision.</InlineNotice>
      ) : null}
      {state.status === "ready"
        ? state.escalations.map((escalation) => (
            <EscalationCard escalation={escalation} key={escalation.finding.id} />
          ))
        : null}
    </div>
  );
}

function EscalationCard({ escalation }: { escalation: QaEscalation }) {
  const { finding } = escalation;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="font-medium">{escalation.lessonTitle}</span>
            <span className="text-muted-foreground">
              {DOMAIN_LABELS[escalation.domain]} · {finding.criterionId}
              {finding.activityId ? ` · ${finding.activityId}` : ""}
            </span>
          </p>
          <p>{finding.rationale}</p>
          <p className="text-xs text-muted-foreground">
            {finding.escalationReason ?? "Needs a decision."} · found {formatDateTime(finding.createdAt)}
          </p>
        </div>
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={`/qa/runs/${escalation.runId}`}
        >
          Open run
        </Link>
      </CardContent>
    </Card>
  );
}
