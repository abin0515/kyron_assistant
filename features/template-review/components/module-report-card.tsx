import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BeforeAfter } from "@/features/template-review/components/before-after";
import type { ModuleReport, ReportFix } from "@/features/template-review/report";
import { formatMinutes, LENGTH_LEVEL_LABELS } from "@/lib/length-targets";

// The module report: what each asset covers, each topic's video length and
// category, what QA found and fixed, what needs a person, and preview links.
export function ModuleReportCard({ previewUrl, report }: { previewUrl: string | null; report: ModuleReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Module report</CardTitle>
        <CardDescription>
          What each asset covers, how long each topic&apos;s video runs, what QA fixed, and what needs your review.
          Video lengths are estimated from the narration until the video is rendered.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <AssetCoverage previewUrl={previewUrl} report={report} />
        <FixedSection fixed={report.fixed} noted={report.noted} resolved={report.resolved} />
        <FlaggedSection report={report} />
      </CardContent>
    </Card>
  );
}

function AssetCoverage({ previewUrl, report }: { previewUrl: string | null; report: ModuleReport }) {
  if (report.topics.length === 0) {
    return <p className="text-sm text-muted-foreground">The template has no assets yet.</p>;
  }

  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">Assets by topic</h3>
      {report.topics.map((topic) => (
        <div className="grid gap-2 rounded-lg border border-border/80 p-3" key={topic.key}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{topic.topic}</p>
            {topic.video ? (
              <Badge variant="info">
                Video {formatMinutes(topic.video.minutes)} · {LENGTH_LEVEL_LABELS[topic.video.category]}
              </Badge>
            ) : null}
          </div>
          {topic.objectives.length > 0 ? (
            <ul className="grid list-disc gap-0.5 pl-5 text-sm text-muted-foreground">
              {topic.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Asset</th>
                <th className="py-1 pr-3 font-medium">Type</th>
                <th className="py-1 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {topic.assets.map((asset) => (
                <tr className="border-t border-border/60" key={asset.activityId}>
                  <td className="py-1.5 pr-3">{asset.title}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{asset.kindLabel}</td>
                  <td className="py-1.5">
                    <span className="flex flex-wrap gap-3">
                      <a className="text-primary underline-offset-4 hover:underline" href={`#${asset.anchor}`}>
                        In this page
                      </a>
                      {previewUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                          href={previewUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Kyron preview
                          <ExternalLink aria-hidden="true" className="size-3" />
                        </a>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Kyron offers one preview link for the whole draft; it opens at the start of the lesson.
      </p>
    </section>
  );
}

function FixedSection({ fixed, noted, resolved }: { fixed: ReportFix[]; noted: ReportFix[]; resolved: ReportFix[] }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">What QA found and fixed ({fixed.length})</h3>
      {fixed.length === 0 ? <p className="text-sm text-muted-foreground">QA did not need to change anything.</p> : null}
      {fixed.map((fix) => (
        <FixCard fix={fix} key={fix.id} />
      ))}
      {resolved.length > 0 ? (
        <FixList fixes={resolved} summary={`Resolved on re-check, no change needed (${resolved.length})`} />
      ) : null}
      {noted.length > 0 ? <FixList fixes={noted} summary={`Also noted, minor and not changed (${noted.length})`} /> : null}
    </section>
  );
}

// One fix, with every check that found it and each change shown once.
function FixCard({ fix }: { fix: ReportFix }) {
  return (
    <article className="grid gap-2 rounded-lg border border-border/80 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="success">Fixed</Badge>
        <span className="font-medium">{fix.titles.join(" + ")}</span>
        <span className="text-muted-foreground">· {fix.where}</span>
      </p>
      {fix.titles.length > 1 ? <p className="text-xs text-muted-foreground">Found by {fix.titles.length} checks</p> : null}
      {fix.reasons.map((reason) => (
        <p className="text-sm text-muted-foreground" key={reason}>
          {reason}
        </p>
      ))}
      {fix.changes.map((change, index) => (
        <BeforeAfter after={change.after} before={change.before} key={`${change.activityId}-${change.fieldPath}-${index}`} />
      ))}
    </article>
  );
}

function FixList({ fixes, summary }: { fixes: ReportFix[]; summary: string }) {
  return (
    <details className="rounded-lg border border-border/80 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{summary}</summary>
      <ul className="mt-2 grid gap-2">
        {fixes.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.titles.join(" + ")}</span>
            <span className="text-muted-foreground"> · {item.where}: {item.reasons.join(" ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FlaggedSection({ report }: { report: ModuleReport }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">Flagged for human review ({report.flagged.length})</h3>
      {report.flagged.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is flagged for review.</p>
      ) : (
        <ul className="grid gap-2">
          {report.flagged.map((flag) => (
            <li className="grid gap-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm" key={flag.id}>
              <span className="font-medium">
                {flag.title} <span className="font-normal text-muted-foreground">· {flag.where}</span>
              </span>
              <span className="text-muted-foreground">{flag.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
