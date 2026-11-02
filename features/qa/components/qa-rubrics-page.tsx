"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { approveQaRubric, listQaRubrics } from "@/features/qa/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { QaRubricPack } from "@/types/api";

type RubricState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rubrics: QaRubricPack[] };

export function QaRubricsPage({ isAdmin }: { isAdmin: boolean }) {
  const [state, setState] = useState<RubricState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const { rubrics } = await listQaRubrics(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", rubrics });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Rubrics could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        description="The standard each lesson is checked against, one pack per domain. Version 1 is a draft built from the QA proposal; known defects from colleagues will refine it."
        title="Rubrics"
      />
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading rubrics…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready"
        ? state.rubrics.map((rubric) => (
            <RubricCard
              isAdmin={isAdmin}
              key={rubric.domain}
              onApproved={(rubrics) => setState({ status: "ready", rubrics })}
              rubric={rubric}
            />
          ))
        : null}
    </div>
  );
}

function RubricCard({
  isAdmin,
  onApproved,
  rubric,
}: {
  isAdmin: boolean;
  onApproved: (rubrics: QaRubricPack[]) => void;
  rubric: QaRubricPack;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setWorking(true);
    setError(null);

    try {
      onApproved((await approveQaRubric(rubric.domain)).rubrics);
    } catch (approveError) {
      setError(messageFromError(approveError, "The rubric could not be approved."));
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {rubric.name}
          <Badge variant={rubric.approval ? "success" : "warning"}>
            {rubric.version} {rubric.approval ? "approved" : "draft"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {rubric.audienceGuidance}
          {rubric.approval
            ? ` Approved by ${rubric.approval.approvedBy} on ${formatDateTime(rubric.approval.approvedAt)}.`
            : ""}
        </CardDescription>
        {isAdmin && !rubric.approval ? (
          <CardAction>
            <Button disabled={working} onClick={() => void approve()} size="sm" type="button">
              {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              Approve {rubric.version}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <ul className="grid divide-y divide-border/80 text-sm">
          {rubric.criteria.map((criterion) => (
            <li className="grid gap-1 py-2.5" key={criterion.id}>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {criterion.title}
                <Badge variant="neutral">{criterion.evaluator === "human" ? "Human check" : criterion.evaluator}</Badge>
                {criterion.required ? null : <Badge variant="neutral">Optional</Badge>}
              </p>
              <p className="text-muted-foreground">{criterion.requirement}</p>
              <p className="text-xs text-muted-foreground">Release blocker: {criterion.releaseBlocker}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
