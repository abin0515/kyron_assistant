import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOMAIN_LABELS, formatTokens, stageDisplay } from "@/features/qa/labels";
import type { QaDomainMetrics, QaMetricsResponse, QaRunStage } from "@/types/api";

export function QaMetricsCards({ metrics }: { metrics: QaMetricsResponse }) {
  return (
    <section aria-label="QA metrics by domain" className="grid gap-4 md:grid-cols-2">
      {metrics.domains.map((domain) => (
        <DomainCard domain={domain} key={domain.domain} />
      ))}
    </section>
  );
}

function DomainCard({ domain }: { domain: QaDomainMetrics }) {
  const stages = Object.entries(domain.runsByStage) as Array<[QaRunStage, number]>;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{DOMAIN_LABELS[domain.domain]}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <Stat label="Lessons" value={domain.lessons} />
          <Stat label="Runs" value={domain.runs} />
          <Stat label="Open blocking" value={domain.openBlockingFindings} />
          <Stat label="Need decision" value={domain.pendingEscalations} />
          <Stat
            label="Findings"
            value={`${domain.findingsBySeverity.critical}/${domain.findingsBySeverity.major}/${domain.findingsBySeverity.minor}`}
            hint="critical / major / minor"
          />
          <Stat label="Rejected as wrong" value={domain.rejectedFindings} />
          <Stat
            label="Audits"
            value={`${domain.audits.completed}/${domain.audits.required}`}
            hint={`${domain.audits.defectsFound} defect(s) found`}
          />
          <Stat
            label="Tokens"
            value={formatTokens(domain.usage.inputTokens + domain.usage.outputTokens)}
            hint={`${formatTokens(domain.averageTokensPerRun)} per run`}
          />
        </dl>
        {stages.length > 0 ? (
          <p className="text-muted-foreground">
            Latest runs:{" "}
            {stages.map(([stage, count]) => `${stageDisplay(stage).label} ${count}`).join(" · ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ hint, label, value }: { hint?: string; label: string; value: number | string }) {
  return (
    <div className="grid content-start">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium" title={hint}>
        {value}
      </dd>
    </div>
  );
}
