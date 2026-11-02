import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckStatusBadge } from "@/features/qa/components/qa-badges";
import type { QaCheckResult, QaCheckStatus, QaRunDetailResponse } from "@/types/api";

const STATUS_PRIORITY: QaCheckStatus[] = ["fail", "not_tested", "needs_review", "pass", "not_applicable"];

// Shows every automated criterion so a skipped or untested check is never
// hidden behind an overall pass.
export function QaCoveragePanel({ detail }: { detail: QaRunDetailResponse }) {
  const criteria = detail.criteria.filter((criterion) => criterion.evaluator !== "human");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check coverage</CardTitle>
        <CardDescription>
          Each criterion shows its worst result across activities. Not tested never counts as passed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid divide-y divide-border/80">
          {criteria.map((criterion) => {
            const checks = detail.run.checks.filter((check) => check.criterionId === criterion.id);
            const worst = worstStatus(checks);

            return (
              <li className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4" key={criterion.id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {criterion.title}
                    {criterion.required ? null : <span className="text-muted-foreground"> (optional)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{summarize(checks)}</p>
                </div>
                <div className="shrink-0">
                  {worst ? (
                    <CheckStatusBadge status={worst} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Not run yet</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function worstStatus(checks: QaCheckResult[]): QaCheckStatus | null {
  return STATUS_PRIORITY.find((status) => checks.some((check) => check.status === status)) ?? null;
}

function summarize(checks: QaCheckResult[]): string {
  if (checks.length === 0) {
    return "No results yet.";
  }

  const failing = checks.find((check) => check.status === "fail" || check.status === "not_tested");

  if (failing) {
    return `${failing.activityId ? `${failing.activityId}: ` : ""}${failing.summary}`;
  }

  const counts = STATUS_PRIORITY.map((status) => [status, checks.filter((check) => check.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status.replace("_", " ")}`);

  return counts.join(", ");
}
