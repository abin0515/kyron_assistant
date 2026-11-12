"use client";

import { ArrowLeft, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { useDraftPolling } from "@/features/drafts/kyron-drafts/hooks/use-draft-polling";
import type { DraftPollingState } from "@/features/drafts/kyron-drafts/types";
import { getDraftWorkspace } from "@/features/drafts/workspaces/api";
import { rerunQaRun } from "@/features/qa/api";
import { useWorkspaceQa } from "@/features/qa/hooks/use-workspace-qa";
import { messageFromError } from "@/features/qa/labels";
import { ApprovalCard } from "@/features/template-review/components/approval-card";
import { CourseStepBar } from "@/features/template-review/components/course-step-bar";
import { ModuleReportCard } from "@/features/template-review/components/module-report-card";
import { TemplateContent } from "@/features/template-review/components/template-content";
import { buildModuleReport } from "@/features/template-review/report";
import { courseSteps } from "@/features/template-review/steps";
import { LENGTH_LEVEL_LABELS, levelForDuration, levelTargetsSummary } from "@/lib/length-targets";
import type { DraftWorkspace, QaRunDetailResponse } from "@/types/api";

const WAIT_FOR_RUN_MS = 15_000;

// Steps 3–5 for the workspace owner: Kyron generates the template, QA checks
// and fixes it, the owner reviews the template and the module report, then
// approves it so video rendering can start.
export function TemplateReviewPage({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<DraftWorkspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qaRefreshKey, setQaRefreshKey] = useState(0);
  const polling = useDraftPolling(workspace?.kyronDraftId ?? null);
  const { applyQa, state: qaState } = useWorkspaceQa(workspaceId, { onSetupSettled: () => undefined, refreshKey: qaRefreshKey });
  const qa = qaState.status === "ready" ? qaState.qa : null;
  const lesson = qa?.lesson ?? null;
  const generated = polling.state.phase === "complete";

  useEffect(() => {
    const controller = new AbortController();

    getDraftWorkspace(workspaceId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setWorkspace(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(messageFromError(error, "The workspace could not be loaded."));
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  const { checkNow } = polling;

  // Kyron finished, but QA has not started the lesson check yet: look again,
  // and re-sync the draft, which starts the check if it was missed.
  useEffect(() => {
    if (!generated || lesson) {
      return;
    }

    const timer = window.setTimeout(() => {
      checkNow();
      setQaRefreshKey((key) => key + 1);
    }, WAIT_FOR_RUN_MS);

    return () => window.clearTimeout(timer);
  }, [checkNow, generated, lesson, qaRefreshKey]);

  const report = useMemo(() => (lesson ? buildModuleReport(lesson) : null), [lesson]);

  function handleApprovalChange(detail: QaRunDetailResponse | null) {
    if (detail && qa) {
      applyQa({ ...qa, lesson: detail });
    } else {
      setQaRefreshKey((key) => key + 1);
    }
  }

  async function handleRerun(runId: string) {
    const detail = await rerunQaRun(runId);

    handleApprovalChange(detail);
  }

  if (loadError) {
    return <InlineNotice tone="error">{loadError}</InlineNotice>;
  }

  if (!workspace) {
    return <Loading label="Loading the course…" />;
  }

  const level = levelForDuration(workspace.duration);

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          polling.state.draft ? (
            <a
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={polling.state.draft.previewUrl}
              rel="noreferrer"
              target="_blank"
            >
              Preview in Kyron
              <ExternalLink aria-hidden="true" />
            </a>
          ) : null
        }
        description={
          level
            ? `Length: ${LENGTH_LEVEL_LABELS[level]} · ${levelTargetsSummary(level)}`
            : "Review the generated template, then approve it to render video."
        }
        eyebrow={
          <Link
            className={buttonVariants({ className: "-ml-3 w-fit text-muted-foreground", size: "sm", variant: "ghost" })}
            href={`/drafts/${workspace.id}`}
          >
            <ArrowLeft aria-hidden="true" />
            Back to the plan
          </Link>
        }
        title={`Review: ${workspace.name || "Untitled draft"}`}
      />
      <CourseStepBar
        steps={courseSteps({ draftStatus: polling.state.draft?.status ?? null, lessonRun: lesson?.run ?? null, workspace })}
      />
      {qaState.status === "error" ? <InlineNotice tone="error">{qaState.message}</InlineNotice> : null}
      {qaState.status === "ready" && qaState.advanceError ? <InlineNotice tone="error">{qaState.advanceError}</InlineNotice> : null}
      <ReviewBody
        hasDraft={workspace.kyronDraftId !== null}
        lesson={lesson}
        onApprovalChange={handleApprovalChange}
        onCheckDraft={polling.checkNow}
        onRerun={handleRerun}
        polling={polling.state}
        previewUrl={polling.state.draft?.previewUrl ?? null}
        report={report}
        workspaceId={workspace.id}
      />
    </div>
  );
}

function ReviewBody({
  hasDraft,
  lesson,
  onApprovalChange,
  onCheckDraft,
  onRerun,
  polling,
  previewUrl,
  report,
  workspaceId,
}: {
  hasDraft: boolean;
  lesson: QaRunDetailResponse | null;
  onApprovalChange: (detail: QaRunDetailResponse | null) => void;
  onCheckDraft: () => void;
  onRerun: (runId: string) => Promise<void>;
  polling: DraftPollingState;
  previewUrl: string | null;
  report: ReturnType<typeof buildModuleReport> | null;
  workspaceId: string;
}) {
  const generated = polling.phase === "complete";

  if (!hasDraft) {
    return (
      <InlineNotice>
        The plan has not been sent to Kyron yet.{" "}
        <Link className="font-medium underline underline-offset-4" href={`/drafts/${workspaceId}`}>
          Finish the plan
        </Link>{" "}
        and create the Kyron draft first.
      </InlineNotice>
    );
  }

  if (!lesson && (polling.phase === "generation_error" || polling.phase === "unavailable" || polling.phase === "request_error")) {
    return (
      <InlineNotice tone="error">
        {polling.phase === "generation_error"
          ? `Kyron could not generate the template.${polling.draft?.statusMessage ? ` ${polling.draft.statusMessage}` : ""}`
          : (polling.errorMessage ?? "The Kyron draft could not be reached.")}{" "}
        <button className="font-medium underline underline-offset-4" onClick={onCheckDraft} type="button">
          Check again
        </button>
      </InlineNotice>
    );
  }

  if (!generated && !lesson) {
    return <Loading label="Kyron is generating the template. This page updates on its own." />;
  }

  if (!lesson || !report) {
    return <Loading label="Kyron finished. Waiting for QA to start checking the template…" />;
  }

  return (
    <>
      <ApprovalCard detail={lesson} flaggedCount={report.flagged.length} onChanged={onApprovalChange} onRerun={onRerun} />
      {lesson.snapshot ? (
        <>
          <ModuleReportCard previewUrl={previewUrl} report={report} />
          <TemplateContent detail={lesson} topics={report.topics} />
        </>
      ) : lesson.pendingStepCount > 0 ? (
        <Loading label="QA is reading the template from Kyron…" />
      ) : (
        <StoppedRun detail={lesson} onRerun={onRerun} />
      )}
    </>
  );
}

// The run ended before it could read the template (for example Kyron was not
// connected): say why and offer a fresh check.
function StoppedRun({ detail, onRerun }: { detail: QaRunDetailResponse; onRerun: (runId: string) => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setWorking(true);
    setError(null);

    try {
      await onRerun(detail.run.id);
    } catch (rerunError) {
      setError(messageFromError(rerunError, "QA could not be started again."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <InlineNotice tone="error">
      <span className="grid gap-2">
        <span>QA could not read the template: {detail.run.stageMessage}</span>
        {error ? <span>{error}</span> : null}
        <span>
          <Button disabled={working} onClick={() => void rerun()} size="sm" type="button" variant="outline">
            {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
            Run QA again
          </Button>
        </span>
      </span>
    </InlineNotice>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </p>
  );
}
