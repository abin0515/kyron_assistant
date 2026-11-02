"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideQaFinding } from "@/features/qa/api";
import {
  FindingStatusBadge,
  SeverityBadge,
} from "@/features/qa/components/qa-badges";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type {
  QaFinding,
  QaFindingDecisionRequest,
  QaRunDetailResponse,
} from "@/types/api";

// Answers the five reviewer questions: where, which standard, what evidence,
// what change, and what gets retested.
export function QaFindingCard({
  detail,
  finding,
  isAdmin,
  onChanged,
}: {
  detail: QaRunDetailResponse;
  finding: QaFinding;
  isAdmin: boolean;
  onChanged: (detail: QaRunDetailResponse) => void;
}) {
  const criterion = detail.criteria.find((candidate) => candidate.id === finding.criterionId);
  const activity = detail.snapshot?.activities.find((candidate) => candidate.id === finding.activityId);
  const decidable = isAdmin && (finding.status === "escalated" || finding.status === "open");

  return (
    <article className="grid gap-3 rounded-lg border border-border/80 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <FindingStatusBadge status={finding.status} />
        <h3 className="text-sm font-medium">{criterion?.title ?? finding.criterionId}</h3>
      </header>

      <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Where</dt>
        <dd>
          {finding.activityId
            ? `${activity?.title ?? finding.activityId} (${finding.activityId})`
            : "Whole lesson"}
          {finding.fieldPath ? ` · ${finding.fieldPath}` : ""}
        </dd>
        <dt className="text-muted-foreground">Standard</dt>
        <dd>{criterion?.requirement ?? finding.expectedBehavior}</dd>
        <dt className="text-muted-foreground">Problem</dt>
        <dd>{finding.rationale}</dd>
        <dt className="text-muted-foreground">Evidence</dt>
        <dd className="grid gap-1">
          {finding.evidence.map((item, index) => (
            <blockquote className="border-l-2 border-border pl-2" key={index}>
              <span className="text-xs text-muted-foreground">{item.label}: </span>
              {item.quote}
            </blockquote>
          ))}
        </dd>
        <dt className="text-muted-foreground">Change</dt>
        <dd>
          <ProposedChange finding={finding} />
        </dd>
        <dt className="text-muted-foreground">Retest</dt>
        <dd>{finding.retest}</dd>
      </dl>

      {finding.decision ? (
        <p className="text-xs text-muted-foreground">
          {finding.decision.outcome} by {finding.decision.decidedBy} on{" "}
          {formatDateTime(finding.decision.decidedAt)}
          {finding.decision.reason ? `: ${finding.decision.reason}` : ""}
        </p>
      ) : null}

      {decidable ? (
        <DecisionForm finding={finding} onChanged={onChanged} runId={detail.run.id} />
      ) : null}
    </article>
  );
}

function ProposedChange({ finding }: { finding: QaFinding }) {
  if (finding.proposedPatch) {
    return (
      <div className="grid gap-2">
        <div className="grid gap-2 md:grid-cols-2">
          <TextBox label="Current" text={finding.proposedPatch.currentValue} tone="current" />
          <TextBox label="Proposed" text={finding.proposedPatch.proposedValue} tone="proposed" />
        </div>
        <p className="text-xs text-muted-foreground">{finding.proposedPatch.rationale}</p>
      </div>
    );
  }

  if (finding.escalationReason) {
    return <span>{finding.escalationReason}</span>;
  }

  return (
    <span className="text-muted-foreground">
      {finding.proposalAttempted ? "No automatic fix; a person needs to decide." : finding.expectedBehavior}
    </span>
  );
}

export function TextBox({ label, text, tone }: { label: string; text: string; tone: "current" | "proposed" }) {
  return (
    <div
      className={
        tone === "current"
          ? "rounded-md border border-destructive/20 bg-destructive/5 p-2"
          : "rounded-md border border-success/25 bg-success/5 p-2"
      }
    >
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function DecisionForm({
  finding,
  onChanged,
  runId,
}: {
  finding: QaFinding;
  onChanged: (detail: QaRunDetailResponse) => void;
  runId: string;
}) {
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<QaFindingDecisionRequest["outcome"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(outcome: QaFindingDecisionRequest["outcome"]) {
    setWorking(outcome);
    setError(null);

    try {
      onChanged(await decideQaFinding(runId, finding.id, { outcome, reason }));
    } catch (decisionError) {
      setError(messageFromError(decisionError, "The decision could not be saved."));
      setWorking(null);
    }
  }

  return (
    <div className="grid gap-2 border-t border-border/80 pt-3">
      <label className="grid gap-1 text-xs font-medium" htmlFor={`reason-${finding.id}`}>
        Reason (required to reject or waive)
        <Textarea
          className="min-h-16"
          id={`reason-${finding.id}`}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={working !== null || !finding.proposedPatch}
          onClick={() => void decide("accepted")}
          size="sm"
          title={finding.proposedPatch ? undefined : "There is no proposed change to accept."}
          type="button"
        >
          {working === "accepted" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          Accept change
        </Button>
        <Button
          disabled={working !== null || !reason.trim()}
          onClick={() => void decide("rejected")}
          size="sm"
          type="button"
          variant="outline"
        >
          <X aria-hidden="true" />
          Reject finding
        </Button>
        <Button
          disabled={working !== null || !reason.trim()}
          onClick={() => void decide("waived")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Waive
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
