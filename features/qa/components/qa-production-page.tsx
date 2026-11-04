"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { listProductionJobs } from "@/features/qa/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { ProductionJob, ProductionStage } from "@/types/api";

const REFRESH_MS = 15_000;

const STAGES: Record<ProductionStage, { label: string; variant: "info" | "success" | "warning" | "destructive" | "neutral" }> = {
  setup: { label: "Course setup", variant: "neutral" },
  generating: { label: "Kyron generating", variant: "info" },
  lesson_qa: { label: "Lesson QA", variant: "info" },
  video: { label: "Video", variant: "info" },
  review: { label: "Needs review", variant: "warning" },
  ready: { label: "Ready", variant: "success" },
  blocked: { label: "Blocked", variant: "destructive" },
};

type JobsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; jobs: ProductionJob[] };

// One row per course in the production pipeline, kept current by the
// scheduler; the page refreshes on its own.
export function QaProductionPage() {
  const [state, setState] = useState<JobsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const { jobs } = await listProductionJobs(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", jobs });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Production jobs could not be loaded.") });
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Every course in the production pipeline: course setup, Kyron generation, lesson QA, video and review. The worker advances each course on its own; the last column lists what a person still has to do."
        title="Production"
      />
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading production jobs…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" && state.jobs.length === 0 ? (
        <InlineNotice tone="info">No courses yet. Generating a course setup starts a production job.</InlineNotice>
      ) : null}
      {state.status === "ready" && state.jobs.length > 0 ? (
        <Card>
          <CardContent>
            <ul className="grid divide-y divide-border/80">
              {state.jobs.map((job) => (
                <JobRow job={job} key={job.id} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function JobRow({ job }: { job: ProductionJob }) {
  const stage = STAGES[job.stage];

  return (
    <li className="grid gap-2 py-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-4">
      <div className="grid gap-1">
        <Link className="font-medium hover:underline" href={`/drafts/${job.workspaceId}`}>
          {job.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={stage.variant}>{stage.label}</Badge>
          {job.kyronDraftId ? <span className="text-xs text-muted-foreground">Kyron draft {job.kyronDraftId}</span> : null}
        </div>
        <p className="text-muted-foreground">{job.stageMessage}</p>
      </div>
      <div className="grid content-start gap-1">
        {job.needs.length > 0 ? (
          <ul className="grid gap-0.5">
            {job.needs.map((need) => (
              <li key={need}>• {need}</li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">Nothing needed from a person right now.</span>
        )}
        <div className="flex flex-wrap gap-3 text-xs">
          {job.setupRunId ? (
            <Link className="text-primary hover:underline" href={`/qa/runs/${job.setupRunId}`}>
              Setup check
            </Link>
          ) : null}
          {job.lessonRunId ? (
            <Link className="text-primary hover:underline" href={`/qa/runs/${job.lessonRunId}`}>
              Lesson check
            </Link>
          ) : null}
        </div>
      </div>
      <div className="grid content-start gap-0.5 text-xs text-muted-foreground md:text-right">
        <span>
          <span className="text-foreground">${job.costUsd.toFixed(4)}</span> of ${job.budgetUsd.toFixed(2)} budget
        </span>
        <span>Updated {formatDateTime(job.updatedAt)}</span>
      </div>
    </li>
  );
}
