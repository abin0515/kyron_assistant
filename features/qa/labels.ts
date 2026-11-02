import type {
  QaCheckStatus,
  QaDomain,
  QaFindingStatus,
  QaRunStage,
  QaRunTarget,
  QaSeverity,
} from "@/types/api";

type BadgeVariant = "info" | "success" | "warning" | "destructive" | "neutral";

export const DOMAIN_LABELS: Record<QaDomain, string> = {
  cpe: "Stevens CPE",
  "hs-ai": "High-school AI",
};

export const TARGET_LABELS: Record<QaRunTarget, string> = {
  course_setup: "Course setup",
  lesson: "Generated lesson",
};

const STAGES: Record<QaRunStage, { label: string; variant: BadgeVariant }> = {
  queued: { label: "Queued", variant: "neutral" },
  snapshot: { label: "Reading lesson", variant: "info" },
  checking: { label: "Checking", variant: "info" },
  repairing: { label: "Fixing", variant: "info" },
  video: { label: "Generating video", variant: "info" },
  media_check: { label: "Checking video", variant: "info" },
  passed: { label: "Passed", variant: "success" },
  verified: { label: "Verified", variant: "success" },
  changes_proposed: { label: "Changes proposed", variant: "warning" },
  incomplete: { label: "Incomplete", variant: "warning" },
  escalated: { label: "Needs decision", variant: "warning" },
  blocked: { label: "Blocked", variant: "destructive" },
  error: { label: "Error", variant: "destructive" },
};

const CHECK_STATUSES: Record<QaCheckStatus, { label: string; variant: BadgeVariant }> = {
  pass: { label: "Pass", variant: "success" },
  fail: { label: "Fail", variant: "destructive" },
  needs_review: { label: "Needs review", variant: "warning" },
  not_tested: { label: "Not tested", variant: "warning" },
  not_applicable: { label: "N/A", variant: "neutral" },
};

const FINDING_STATUSES: Record<QaFindingStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "warning" },
  escalated: { label: "Needs decision", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  fixed: { label: "Fixed", variant: "success" },
  rejected: { label: "Rejected", variant: "neutral" },
  waived: { label: "Waived", variant: "neutral" },
};

const SEVERITIES: Record<QaSeverity, { label: string; variant: BadgeVariant }> = {
  critical: { label: "Critical", variant: "destructive" },
  major: { label: "Major", variant: "warning" },
  minor: { label: "Minor", variant: "neutral" },
};

export const ACTIVE_STAGES: ReadonlySet<QaRunStage> = new Set([
  "queued",
  "snapshot",
  "checking",
  "repairing",
  "video",
  "media_check",
]);

export function stageDisplay(stage: QaRunStage) {
  return STAGES[stage];
}

export function checkStatusDisplay(status: QaCheckStatus) {
  return CHECK_STATUSES[status];
}

export function findingStatusDisplay(status: QaFindingStatus) {
  return FINDING_STATUSES[status];
}

export function severityDisplay(severity: QaSeverity) {
  return SEVERITIES[severity];
}

export function formatDateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
