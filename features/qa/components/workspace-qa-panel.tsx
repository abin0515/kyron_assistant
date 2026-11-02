"use client";

import { ArrowRight, Download, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Textarea } from "@/components/ui/textarea";
import { DraftApiError } from "@/features/drafts/shared/api-response";
import {
  contentVersionDownloadUrl,
  startWorkspaceSetupCheck,
  submitWorkspaceLessonContent,
} from "@/features/qa/api";
import { SeverityBadge, StageBadge } from "@/features/qa/components/qa-badges";
import { useWorkspaceQa } from "@/features/qa/hooks/use-workspace-qa";
import { ACTIVE_STAGES, messageFromError } from "@/features/qa/labels";
import type { DraftWorkspace, QaFinding, QaRunDetailResponse, QaWorkspaceQaResponse } from "@/types/api";

const MAX_LISTED_FINDINGS = 6;

export function WorkspaceQaPanel({
  onSetupSettled,
  refreshKey,
  workspace,
}: {
  onSetupSettled: () => void;
  refreshKey: number;
  workspace: DraftWorkspace;
}) {
  const { applyQa, state } = useWorkspaceQa(workspace.id, { onSetupSettled, refreshKey });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
          Quality checks
        </CardTitle>
        <CardDescription>
          The QA agent checks the course setup against your sources before Kyron builds it,
          fixes what it safely can, and checks the generated lesson afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading quality checks…
          </p>
        ) : null}
        {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
        {state.status === "ready" ? (
          <>
            {state.advanceError ? (
              <InlineNotice tone="warning">{state.advanceError} Retrying automatically.</InlineNotice>
            ) : null}
            <SetupCheckSection detail={state.qa.setup} onChanged={applyQa} workspace={workspace} />
            {workspace.kyronDraftId ? (
              <LessonCheckSection detail={state.qa.lesson} onChanged={applyQa} workspace={workspace} />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SetupCheckSection({
  detail,
  onChanged,
  workspace,
}: {
  detail: QaRunDetailResponse | null;
  onChanged: (qa: QaWorkspaceQaResponse) => void;
  workspace: DraftWorkspace;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = !workspace.kyronDraftId;
  const active = detail ? isActive(detail) : false;

  async function handleCheck() {
    setStarting(true);
    setError(null);

    try {
      onChanged(await startWorkspaceSetupCheck(workspace.id));
    } catch (checkError) {
      setError(messageFromError(checkError, "The check could not start."));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-label="Course setup check" className="grid gap-2">
      <SectionHeading detail={detail} title="Course setup" />
      {detail ? (
        <RunSummary detail={detail} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Runs automatically when a course setup is generated, and again before the Kyron draft is
          created if the setup changed.
        </p>
      )}
      {editable ? (
        <div>
          <Button disabled={starting || active} onClick={() => void handleCheck()} size="sm" type="button" variant="outline">
            {starting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            {detail ? "Check again" : "Check now"}
          </Button>
        </div>
      ) : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </section>
  );
}

function LessonCheckSection({
  detail,
  onChanged,
  workspace,
}: {
  detail: QaRunDetailResponse | null;
  onChanged: (qa: QaWorkspaceQaResponse) => void;
  workspace: DraftWorkspace;
}) {
  const waitingForContent = !detail || detail.run.stage === "blocked";
  const latestVersion = detail?.versions[0];

  return (
    <section aria-label="Generated lesson check" className="grid gap-2 border-t border-border/80 pt-4">
      <SectionHeading detail={detail} title="Generated lesson" />
      {detail ? (
        <RunSummary detail={detail} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Starts automatically when Kyron finishes generating this draft.
        </p>
      )}
      {latestVersion?.status === "proposed" ? (
        <div>
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={contentVersionDownloadUrl(latestVersion.id)}
          >
            <Download aria-hidden="true" />
            Download revised lesson (v{latestVersion.versionNumber})
          </a>
        </div>
      ) : null}
      {waitingForContent ? <LessonContentForm onChanged={onChanged} workspaceId={workspace.id} /> : null}
    </section>
  );
}

function LessonContentForm({
  onChanged,
  workspaceId,
}: {
  onChanged: (qa: QaWorkspaceQaResponse) => void;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let packet: unknown;

    try {
      packet = JSON.parse(text);
    } catch {
      setErrors(["The lesson content is not valid JSON."]);
      return;
    }

    setSubmitting(true);
    setErrors([]);

    try {
      onChanged(await submitWorkspaceLessonContent(workspaceId, packet));
      setOpen(false);
      setText("");
    } catch (error) {
      setErrors(
        error instanceof DraftApiError && error.fieldErrors?.request
          ? error.fieldErrors.request
          : [messageFromError(error, "The lesson content could not be checked.")],
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
          Paste generated lesson content
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-2" onSubmit={(event) => void handleSubmit(event)}>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor={`lesson-content-${workspaceId}`}>
        Generated lesson (JSON)
        <Textarea
          className="min-h-48 font-mono text-xs"
          id={`lesson-content-${workspaceId}`}
          onChange={(event) => setText(event.target.value)}
          placeholder='{ "lesson": { "title": "…" }, "activities": [ … ] }'
          spellCheck={false}
          value={text}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Copy the activities from Kyron Studio. The workspace sources are added as references
        automatically. The format is described in docs/QA_AGENT_PLAN.md.
      </p>
      {errors.length > 0 ? (
        <InlineNotice tone="error">
          <ul className="grid list-disc gap-0.5 pl-4">
            {errors.slice(0, 8).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </InlineNotice>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={submitting || !text.trim()} size="sm" type="submit">
          {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          Check lesson
        </Button>
        <Button onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SectionHeading({ detail, title }: { detail: QaRunDetailResponse | null; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {title}
        {detail ? <StageBadge stage={detail.run.stage} /> : null}
      </h3>
      {detail ? (
        <Link
          className={buttonVariants({ size: "xs", variant: "ghost" })}
          href={`/qa/runs/${detail.run.id}`}
        >
          Full report
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function RunSummary({ detail }: { detail: QaRunDetailResponse }) {
  const findings = [...detail.run.findings]
    .sort((left, right) => severityRank(left) - severityRank(right))
    .slice(0, MAX_LISTED_FINDINGS);

  return (
    <div className="grid gap-2 text-sm">
      <p className="flex items-start gap-2 text-muted-foreground">
        {isActive(detail) ? (
          <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />
        ) : null}
        {detail.run.stageMessage}
      </p>
      {findings.length > 0 ? (
        <ul className="grid gap-1.5">
          {findings.map((finding) => (
            <FindingRow detail={detail} finding={finding} key={finding.id} />
          ))}
        </ul>
      ) : null}
      {detail.run.findings.length > MAX_LISTED_FINDINGS ? (
        <p className="text-xs text-muted-foreground">
          {detail.run.findings.length - MAX_LISTED_FINDINGS} more in the full report.
        </p>
      ) : null}
    </div>
  );
}

function FindingRow({ detail, finding }: { detail: QaRunDetailResponse; finding: QaFinding }) {
  const criterion = detail.criteria.find((candidate) => candidate.id === finding.criterionId);

  return (
    <li className="grid gap-1 rounded-lg border border-border/80 px-3 py-2">
      <p className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="font-medium">{criterion?.title ?? finding.criterionId}</span>
        <span className="text-xs text-muted-foreground">{findingOutcome(finding)}</span>
      </p>
      <p className="text-muted-foreground">{finding.rationale}</p>
      {finding.proposedPatch ? (
        <p className="text-xs">
          <span className="text-muted-foreground">{finding.proposedPatch.fieldPath}: </span>
          <span className="line-through decoration-destructive/60">{truncate(finding.proposedPatch.currentValue)}</span>
          {" → "}
          <span>{truncate(finding.proposedPatch.proposedValue)}</span>
        </p>
      ) : null}
    </li>
  );
}

function findingOutcome(finding: QaFinding): string {
  if (finding.status === "fixed") {
    return finding.repairAttempts > 0 ? "Fixed automatically" : "Resolved";
  }

  if (finding.status === "escalated") {
    return finding.escalationReason ?? "Needs a decision";
  }

  if (finding.status === "open") {
    return finding.severity === "minor" ? "Suggestion" : "Open";
  }

  return finding.status[0].toUpperCase() + finding.status.slice(1);
}

function isActive(detail: QaRunDetailResponse): boolean {
  return detail.pendingStepCount > 0 || ACTIVE_STAGES.has(detail.run.stage);
}

function severityRank(finding: QaFinding): number {
  const resolved = ["fixed", "rejected", "waived"].includes(finding.status) ? 3 : 0;

  return resolved + { critical: 0, major: 1, minor: 2 }[finding.severity];
}

function truncate(text: string): string {
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
