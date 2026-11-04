import { Badge } from "@/components/ui/badge";
import { diffWords } from "@/features/kyron-content/word-diff";
import type { LiveStatus } from "@/features/kyron-content/revision-status";
import { findingStatusDisplay, formatDateTime, severityDisplay } from "@/features/qa/labels";
import type { KyronRevisionChange, KyronRevisionFinding } from "@/types/api";

const LIVE_STATUS: Record<LiveStatus, { label: string; variant: "success" | "warning" | "neutral" | "info" }> = {
  in_kyron: { label: "In Kyron now", variant: "success" },
  changed_since: { label: "Changed in Kyron since", variant: "warning" },
  not_applied: { label: "Not applied", variant: "neutral" },
  applied_later: { label: "Applied later", variant: "info" },
  not_checked: { label: "Not compared", variant: "neutral" },
};

// One field change: where it is, the finding behind it, the text before and
// after with the changed words marked, and whether Kyron still holds it.
export function RevisionChangeCard({
  anchorId,
  change,
  highlighted,
  live,
}: {
  anchorId: string;
  change: KyronRevisionChange;
  highlighted: boolean;
  live: LiveStatus;
}) {
  const status = LIVE_STATUS[live];

  return (
    <article
      className={
        highlighted
          ? "grid gap-3 rounded-lg border border-info/50 bg-info/5 p-3 ring-2 ring-info/30"
          : "grid gap-3 rounded-lg border border-border/80 p-3"
      }
      id={anchorId}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{change.location}</h4>
        <Badge variant={status.variant}>
          {live === "applied_later" && change.appliedInVersion ? `Applied in v${change.appliedInVersion}` : status.label}
        </Badge>
      </header>
      {change.findings.map((finding) => (
        <FindingSummary finding={finding} key={finding.id} />
      ))}
      <ChangeDiff after={change.after} before={change.before} />
      {change.rationale ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Why: </span>
          {change.rationale}
        </p>
      ) : null}
    </article>
  );
}

function FindingSummary({ finding }: { finding: KyronRevisionFinding }) {
  const severity = severityDisplay(finding.severity);
  const status = findingStatusDisplay(finding.status);

  return (
    <div className="grid gap-1 rounded-md bg-muted/50 p-2 text-sm">
      <p className="flex flex-wrap items-center gap-1.5">
        <Badge variant={severity.variant}>{severity.label}</Badge>
        <span className="font-medium">{finding.criterionTitle}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </p>
      <p className="text-muted-foreground">{finding.rationale}</p>
      {finding.decision ? (
        <p className="text-xs text-muted-foreground">
          {finding.decision.outcome === "accepted" ? "Approved" : finding.decision.outcome === "rejected" ? "Rejected" : "Waived"} by{" "}
          {finding.decision.decidedBy} on {formatDateTime(finding.decision.decidedAt)}: “{finding.decision.reason}”
        </p>
      ) : null}
    </div>
  );
}

function ChangeDiff({ after, before }: { after: string; before: string | null }) {
  const parts = diffWords(before ?? "", after);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <DiffSide label="Before" parts={parts.filter((part) => part.kind !== "added")} tone="removed" />
      <DiffSide label="After" parts={parts.filter((part) => part.kind !== "removed")} tone="added" />
    </div>
  );
}

function DiffSide({
  label,
  parts,
  tone,
}: {
  label: string;
  parts: ReturnType<typeof diffWords>;
  tone: "removed" | "added";
}) {
  const box = tone === "removed" ? "border-destructive/20 bg-destructive/5" : "border-success/25 bg-success/5";
  const mark =
    tone === "removed"
      ? "rounded-sm bg-destructive/15 text-destructive line-through decoration-destructive/60"
      : "rounded-sm bg-success/20 font-medium text-success-foreground";

  return (
    <div className={`rounded-md border p-2 ${box}`}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {parts.length === 0 ? <span className="text-muted-foreground">(empty)</span> : null}
        {parts.map((part, index) =>
          part.kind === "same" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <mark className={mark} key={index}>
              {part.text}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}
