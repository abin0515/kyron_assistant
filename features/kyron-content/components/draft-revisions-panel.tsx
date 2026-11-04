import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { isQaVersion, liveStatus } from "@/features/kyron-content/revision-status";
import { formatDateTime } from "@/features/qa/labels";
import type { KyronDraftRevisionsResponse, KyronRevisionKind, KyronRevisionVersion } from "@/types/api";

import { RevisionChangeCard } from "./revision-change-card";

const KIND: Record<KyronRevisionKind, { label: string; variant: "success" | "info" | "warning" | "neutral" }> = {
  qa_applied: { label: "Applied by QA", variant: "success" },
  qa_approved: { label: "Applied after a person's approval", variant: "info" },
  qa_proposed: { label: "Proposed, not applied", variant: "warning" },
  kyron_read: { label: "Read from Kyron", variant: "neutral" },
  outside_change: { label: "Changed outside QA", variant: "neutral" },
};

// Tab B: the QA agent's changes to this draft, newest first. Reads and
// outside changes are listed after them, collapsed.
export function DraftRevisionsPanel({
  current,
  focus,
  revisions,
}: {
  current: Map<string, string | null> | null;
  focus: { key: string; versionNumber: number } | null;
  revisions: KyronDraftRevisionsResponse;
}) {
  const qaVersions = revisions.versions.filter((version) => isQaVersion(version.kind) && version.changes.length > 0);
  const otherVersions = revisions.versions.filter((version) => !qaVersions.includes(version));

  if (revisions.versions.length === 0) {
    return <InlineNotice>The QA agent has not checked this draft yet, so there are no revisions.</InlineNotice>;
  }

  return (
    <div className="grid gap-4">
      <RevisionCounts versions={revisions.versions} />
      {current ? null : (
        <InlineNotice>Read the draft from Kyron (the other tab) to see whether each fix is still in Kyron.</InlineNotice>
      )}
      {qaVersions.length === 0 ? (
        <InlineNotice tone="success">The QA agent has not needed to change this draft.</InlineNotice>
      ) : null}
      {qaVersions.map((version) => (
        <VersionCard current={current} focus={focus} key={version.id} version={version} />
      ))}
      {otherVersions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Other versions ({otherVersions.length})</CardTitle>
            <CardDescription>Content QA read from Kyron, and changes made outside the QA agent.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {otherVersions.map((version) => (
              <details className="rounded-lg border border-border/80 px-3 py-2 text-sm" key={version.id}>
                <summary className="cursor-pointer">
                  <VersionHeading version={version} />
                </summary>
                <div className="mt-3 grid gap-3">
                  <p className="text-muted-foreground">{version.summary}</p>
                  {version.changes.map((change, index) => (
                    <RevisionChangeCard
                      anchorId={`change-${version.versionNumber}-${index}`}
                      change={change}
                      highlighted={false}
                      key={`${change.key}-${index}`}
                      live="not_checked"
                    />
                  ))}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function VersionCard({
  current,
  focus,
  version,
}: {
  current: Map<string, string | null> | null;
  focus: { key: string; versionNumber: number } | null;
  version: KyronRevisionVersion;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <VersionHeading version={version} />
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{version.summary}</span>
          {version.runId ? (
            <Link className="text-primary underline-offset-4 hover:underline" href={`/qa/runs/${version.runId}`}>
              Open the QA run
            </Link>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {version.changes.map((change, index) => (
          <RevisionChangeCard
            anchorId={revisionAnchor(change.key, version.versionNumber)}
            change={change}
            highlighted={focus?.key === change.key && focus.versionNumber === version.versionNumber}
            key={`${change.key}-${index}`}
            live={liveStatus(version.kind, change, current)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function VersionHeading({ version }: { version: KyronRevisionVersion }) {
  const kind = KIND[version.kind];

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs font-medium">v{version.versionNumber}</span>
      <Badge variant={kind.variant}>{kind.label}</Badge>
      <span className="text-sm font-normal">{version.author}</span>
      {version.model ? <Badge variant="outline">{version.model}</Badge> : null}
      <span className="text-xs font-normal text-muted-foreground">{formatDateTime(version.createdAt)}</span>
    </span>
  );
}

function RevisionCounts({ versions }: { versions: KyronRevisionVersion[] }) {
  // A proposal that a later QA version applied is counted there, not here.
  const count = (kind: KyronRevisionKind) =>
    versions
      .filter((version) => version.kind === kind)
      .reduce((total, version) => total + version.changes.filter((change) => change.appliedInVersion === null).length, 0);
  const items: Array<[string, number]> = [
    ["Fixed by QA automatically", count("qa_applied")],
    ["Fixed after a person's approval", count("qa_approved")],
    ["Proposed, not applied", count("qa_proposed")],
    ["Changed outside QA", count("outside_change")],
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div className="rounded-lg border border-border/80 bg-card p-3" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-2xl font-light">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function revisionAnchor(key: string, versionNumber: number): string {
  return `change-${versionNumber}-${key.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
