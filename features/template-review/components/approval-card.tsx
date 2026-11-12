"use client";

import { CheckCircle2, Film, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { approveQaRender } from "@/features/qa/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { QaRunDetailResponse } from "@/types/api";

// Step 4 → 5: the person who reviewed the template lets rendering start.
export function ApprovalCard({
  detail,
  flaggedCount,
  onChanged,
  onRerun,
}: {
  detail: QaRunDetailResponse;
  flaggedCount: number;
  onChanged: (detail: QaRunDetailResponse | null) => void;
  onRerun: (runId: string) => Promise<void>;
}) {
  const run = detail.run;
  const approval = run.renderApproval ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film aria-hidden="true" className="size-4" />
          Approve and render
        </CardTitle>
        <CardDescription>
          Video is rendered only after you approve the template. Rendering uses Kyron credits.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {detail.pendingStepCount > 0 && approval?.status !== "approved" ? (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            QA is checking and fixing the template ({run.stageMessage}). The approval opens when it finishes.
          </p>
        ) : approval?.status === "pending" ? (
          <ApproveControl flaggedCount={flaggedCount} onChanged={onChanged} runId={run.id} />
        ) : approval?.status === "approved" ? (
          <ApprovedState detail={detail} onChanged={onChanged} onRerun={onRerun} />
        ) : (
          <p className="text-muted-foreground">{run.stageMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ApproveControl({
  flaggedCount,
  onChanged,
  runId,
}: {
  flaggedCount: number;
  onChanged: (detail: QaRunDetailResponse | null) => void;
  runId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setWorking(true);
    setError(null);

    try {
      onChanged(await approveQaRender(runId));
    } catch (approvalError) {
      setError(messageFromError(approvalError, "The approval could not be saved."));
      // The lesson may have changed in Kyron; reload to show the new check.
      onChanged(null);
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p>
        QA finished checking and fixing the template.{" "}
        {flaggedCount > 0
          ? `${flaggedCount} item(s) are flagged for your review in the report below.`
          : "Nothing is flagged for review."}{" "}
        Read the template and the report, then approve it.
      </p>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {confirming ? (
        <div className="grid gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p>
            Approving starts video rendering in Kyron and uses Kyron credits. It covers up to two renders: the first,
            and one re-render if QA has to fix the narration afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={working} onClick={() => void approve()} type="button">
              {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
              Confirm approval
            </Button>
            <Button disabled={working} onClick={() => setConfirming(false)} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-fit" onClick={() => setConfirming(true)} type="button">
          <CheckCircle2 aria-hidden="true" />
          Approve template and render video
        </Button>
      )}
    </div>
  );
}

function ApprovedState({
  detail,
  onChanged,
  onRerun,
}: {
  detail: QaRunDetailResponse;
  onChanged: (detail: QaRunDetailResponse | null) => void;
  onRerun: (runId: string) => Promise<void>;
}) {
  const run = detail.run;
  const approval = run.renderApproval;
  const stopped = run.stage === "blocked" || run.stage === "error";

  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        Approved by {approval?.decidedBy ?? "a person"} on {formatDateTime(approval?.decidedAt ?? null)}.
      </p>
      {approval?.renderingOff && !run.media ? (
        <>
          <InlineNotice>
            Video rendering is turned off on this site (QA_KYRON_VIDEO), so no video was requested. Once the admin
            turns it on, approve again to render.
          </InlineNotice>
          <RenderAgain onChanged={onChanged} runId={run.id} />
        </>
      ) : run.media?.status === "checked" ? (
        <p className="text-muted-foreground">The video was rendered and its narration checked. {run.stageMessage}</p>
      ) : run.media?.status === "failed" || stopped ? (
        <RenderFailed detail={detail} onRerun={onRerun} />
      ) : detail.pendingStepCount > 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {run.stageMessage}
        </p>
      ) : (
        <p className="text-muted-foreground">{run.stageMessage}</p>
      )}
    </div>
  );
}

// The render or its check failed: say why, and offer a fresh QA check, which
// waits for a new approval before anything is rendered again.
function RenderFailed({ detail, onRerun }: { detail: QaRunDetailResponse; onRerun: (runId: string) => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = detail.run;

  async function rerun() {
    setWorking(true);
    setError(null);

    try {
      await onRerun(run.id);
    } catch (rerunError) {
      setError(messageFromError(rerunError, "QA could not be started again."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <InlineNotice tone="error">
      <span className="grid gap-2">
        <span>{run.media?.message ?? run.stageMessage}</span>
        <span>
          {run.media?.status === "failed" ? "Check the video in Kyron Studio first. " : ""}
          Running QA again checks the template (a few model calls; QA may fix content in Kyron) and waits for a new
          approval before rendering. Each render re-renders every video in the lesson.
        </span>
        {error ? <span>{error}</span> : null}
        <span>
          <Button disabled={working} onClick={() => void rerun()} size="sm" type="button" variant="outline">
            {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Run QA again
          </Button>
        </span>
      </span>
    </InlineNotice>
  );
}

function RenderAgain({ onChanged, runId }: { onChanged: (detail: QaRunDetailResponse | null) => void; runId: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setWorking(true);
    setError(null);

    try {
      onChanged(await approveQaRender(runId));
    } catch (approvalError) {
      setError(messageFromError(approvalError, "The approval could not be saved."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-2">
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <Button className="w-fit" disabled={working} onClick={() => void approve()} type="button" variant="outline">
        {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
        Approve again and render (uses Kyron credits)
      </Button>
    </div>
  );
}
