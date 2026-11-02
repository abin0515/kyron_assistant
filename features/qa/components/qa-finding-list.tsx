import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QaFindingCard } from "@/features/qa/components/qa-finding-card";
import type { QaFinding, QaRunDetailResponse } from "@/types/api";

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 } as const;
const RESOLVED = new Set<QaFinding["status"]>(["fixed", "rejected", "waived"]);

export function QaFindingList({
  detail,
  isAdmin,
  onChanged,
}: {
  detail: QaRunDetailResponse;
  isAdmin: boolean;
  onChanged: (detail: QaRunDetailResponse) => void;
}) {
  const findings = [...detail.run.findings].sort(
    (left, right) =>
      Number(RESOLVED.has(left.status)) - Number(RESOLVED.has(right.status)) ||
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
  const open = findings.filter((finding) => !RESOLVED.has(finding.status));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Findings</CardTitle>
        <CardDescription>
          {findings.length === 0
            ? "No findings yet."
            : `${open.length} open, ${findings.length - open.length} resolved. Critical and major findings block the lesson.`}
        </CardDescription>
      </CardHeader>
      {findings.length > 0 ? (
        <CardContent className="grid gap-3">
          {findings.map((finding) => (
            <QaFindingCard
              detail={detail}
              finding={finding}
              isAdmin={isAdmin}
              key={finding.id}
              onChanged={onChanged}
            />
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
