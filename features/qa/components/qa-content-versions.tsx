"use client";

import { Download } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { contentVersionDownloadUrl } from "@/features/qa/api";
import { TextBox } from "@/features/qa/components/qa-finding-card";
import { formatDateTime } from "@/features/qa/labels";
import type { QaContentChange, QaContentVersion, QaRunDetailResponse } from "@/types/api";

// The version history of the content a run checks, newest first.
export function QaContentVersionsPanel({ detail }: { detail: QaRunDetailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content versions</CardTitle>
        <CardDescription>
          Every version of this {detail.run.target === "course_setup" ? "course setup" : "lesson"}: what
          was read, what the revision agent changed and why, and changes it proposed but could not apply.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QaContentVersionList versions={detail.versions} />
      </CardContent>
    </Card>
  );
}

export function QaContentVersionList({
  showLesson = false,
  versions,
}: {
  showLesson?: boolean;
  versions: QaContentVersion[];
}) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No content versions recorded yet.</p>;
  }

  return (
    <ul className="grid gap-2">
      {versions.map((version) => (
        <li key={version.id}>
          <VersionRow showLesson={showLesson} version={version} />
        </li>
      ))}
    </ul>
  );
}

function VersionRow({ showLesson, version }: { showLesson: boolean; version: QaContentVersion }) {
  return (
    <details className="rounded-lg border border-border/80 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-medium">v{version.versionNumber}</span>
        <Badge variant={version.status === "applied" ? "success" : "warning"}>
          {version.status === "applied" ? "Applied" : "Proposed"}
        </Badge>
        {showLesson ? (
          <span className="font-medium">
            {version.lessonTitle}
            <span className="font-normal text-muted-foreground">
              {" "}
              · {version.target === "course_setup" ? "setup" : "lesson"}
            </span>
          </span>
        ) : null}
        <span>{version.author}</span>
        {version.model ? <Badge variant="outline">{version.model}</Badge> : null}
        <span className="text-muted-foreground">
          {version.changes.length > 0 ? `${version.changes.length} change(s) · ` : ""}
          {formatDateTime(version.createdAt)}
        </span>
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="text-muted-foreground">{version.summary}</p>
        {version.changes.map((change, index) => (
          <ChangeDetails change={change} key={`${change.activityId}-${change.fieldPath}-${index}`} />
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={contentVersionDownloadUrl(version.id)}
          >
            <Download aria-hidden="true" />
            Download v{version.versionNumber}
          </a>
          {version.runId ? (
            <Link className="text-xs text-primary underline-offset-4 hover:underline" href={`/qa/runs/${version.runId}`}>
              QA run
            </Link>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground">{version.contentHash.slice(0, 10)}</span>
        </div>
      </div>
    </details>
  );
}

function ChangeDetails({ change }: { change: QaContentChange }) {
  return (
    <div className="grid gap-2 border-t border-border/60 pt-3">
      <p className="text-xs font-medium">
        {change.activityId ? `${change.activityId} · ` : ""}
        {change.fieldPath}
        {change.criterionIds.length > 0 ? (
          <span className="font-normal text-muted-foreground"> · {change.criterionIds.join(", ")}</span>
        ) : null}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <TextBox label="Before" text={change.before ?? "(empty)"} tone="current" />
        <TextBox label="After" text={change.after} tone="proposed" />
      </div>
      {change.rationale ? <p className="text-xs text-muted-foreground">{change.rationale}</p> : null}
    </div>
  );
}
