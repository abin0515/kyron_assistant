import { Badge } from "@/components/ui/badge";
import {
  checkStatusDisplay,
  findingStatusDisplay,
  severityDisplay,
  stageDisplay,
} from "@/features/qa/labels";
import type { QaCheckStatus, QaFindingStatus, QaRunStage, QaSeverity } from "@/types/api";

export function StageBadge({ stage }: { stage: QaRunStage }) {
  const { label, variant } = stageDisplay(stage);

  return <Badge variant={variant}>{label}</Badge>;
}

export function CheckStatusBadge({ status }: { status: QaCheckStatus }) {
  const { label, variant } = checkStatusDisplay(status);

  return <Badge variant={variant}>{label}</Badge>;
}

export function FindingStatusBadge({ status }: { status: QaFindingStatus }) {
  const { label, variant } = findingStatusDisplay(status);

  return <Badge variant={variant}>{label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: QaSeverity }) {
  const { label, variant } = severityDisplay(severity);

  return <Badge variant={variant}>{label}</Badge>;
}
