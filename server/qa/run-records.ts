import "server-only";

import { randomUUID } from "node:crypto";

import type {
  QaCheckResult,
  QaFinding,
  QaLesson,
  QaRubricPack,
  QaRunStage,
  QaRunTarget,
  QaSeverity,
  QaUsage,
} from "@/types/api";

import type { EvaluationOutput, UsageRecord } from "./evaluators/types";
import type { QaStep, ScriptEvaluatorId, StoredQaRun } from "./types";

const MAX_EVENTS = 300;
const DEFAULT_TOKEN_BUDGET = 600_000;
const BLOCKING_SEVERITIES: ReadonlySet<QaSeverity> = new Set(["critical", "major"]);
const UNRESOLVED_STATUSES: ReadonlySet<QaFinding["status"]> = new Set(["open", "accepted"]);

export function createRunRecord({
  createdBy,
  lesson,
  rubric,
  snapshotId,
  source,
  steps,
  target,
}: {
  createdBy: string;
  lesson: QaLesson;
  rubric: QaRubricPack;
  snapshotId: string | null;
  source: StoredQaRun["source"];
  steps: QaStep[];
  target: QaRunTarget;
}): StoredQaRun {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    lessonId: lesson.id,
    workspaceId: lesson.workspaceId,
    ownerId: lesson.ownerId,
    target,
    snapshotId,
    domain: lesson.domain,
    rubricVersion: rubric.version,
    rubricApproved: rubric.approval !== null,
    source,
    stage: "queued",
    stageMessage: "Waiting to start.",
    checks: [],
    findings: [],
    humanChecks: rubric.criteria
      .filter((criterion) => criterion.target === target && criterion.evaluator === "human")
      .map((criterion) => ({
        criterionId: criterion.id,
        title: criterion.title,
        status: "pending",
        note: null,
        decidedBy: null,
        decidedAt: null,
      })),
    media: null,
    events: [{ at: now, level: "info", message: `Run created by ${createdBy}.` }],
    usage: emptyUsage(),
    usageByPurpose: {},
    tokenBudget: tokenBudget(),
    audit: {
      required: false,
      sampledAt: null,
      outcome: null,
      note: null,
      decidedBy: null,
      decidedAt: null,
    },
    createdAt: now,
    createdBy,
    updatedAt: now,
    completedAt: null,
    pendingSteps: steps,
    lease: null,
    stepFailures: 0,
    patchedFields: [],
    videoJobId: null,
    mediaFilePath: null,
    renderApproval: null,
    lengths: null,
  };
}

export function appendEvent(
  run: StoredQaRun,
  level: "info" | "warn" | "error",
  message: string,
): StoredQaRun {
  return {
    ...run,
    events: [...run.events, { at: new Date().toISOString(), level, message }].slice(-MAX_EVENTS),
  };
}

export function addUsage(run: StoredQaRun, records: UsageRecord[]): StoredQaRun {
  return records.reduce((current, record) => {
    const byPurpose = current.usageByPurpose[record.purpose] ?? emptyUsage();

    return {
      ...current,
      usage: addToUsage(current.usage, record),
      usageByPurpose: {
        ...current.usageByPurpose,
        [record.purpose]: addToUsage(byPurpose, record),
      },
    };
  }, run);
}

export function totalTokens(usage: QaUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

export function isBlocking(finding: Pick<QaFinding, "severity">): boolean {
  return BLOCKING_SEVERITIES.has(finding.severity);
}

export function isUnresolvedBlocking(finding: QaFinding): boolean {
  return isBlocking(finding) && UNRESOLVED_STATUSES.has(finding.status);
}

// Replaces the evaluator's earlier results within the checked scope. Earlier
// open findings that the evaluator no longer reports are marked fixed; findings
// it reports again keep their history (repair attempts, decisions).
export function mergeEvaluation(
  run: StoredQaRun,
  {
    evaluator,
    output,
    scope,
    snapshotId,
  }: {
    evaluator: ScriptEvaluatorId | "media";
    output: EvaluationOutput;
    scope: string[] | null;
    snapshotId: string;
  },
): StoredQaRun {
  const now = new Date().toISOString();
  const inScope = (activityId: string | null) =>
    scope === null || activityId === null || scope.includes(activityId);
  const checks: QaCheckResult[] = [
    ...run.checks.filter((check) => check.evaluator !== evaluator || !inScope(check.activityId)),
    ...output.checks.map((check) => ({ ...check, id: randomUUID(), snapshotId, checkedAt: now })),
  ];
  const remaining = [...output.findings];
  const findings = run.findings.map((finding) => {
    if (finding.evaluator !== evaluator || !inScope(finding.activityId)) {
      return finding;
    }

    const matchIndex = remaining.findIndex((draft) => sameLocation(draft, finding));

    if (matchIndex >= 0) {
      const [draft] = remaining.splice(matchIndex, 1);
      const textChanged = draft.observedText !== finding.observedText;
      const hint = draft.proposedPatch ?? null;

      return {
        ...finding,
        ...draft,
        snapshotId,
        // A stale proposal would target text that no longer exists. The
        // revision agent's proposal stays until the text changes; evaluator
        // suggestions are only hints for the agent.
        proposedPatch: textChanged
          ? hint
          : finding.proposalAttempted
            ? finding.proposedPatch
            : (hint ?? finding.proposedPatch),
        proposalAttempted: textChanged ? false : finding.proposalAttempted,
      };
    }

    return UNRESOLVED_STATUSES.has(finding.status) ? { ...finding, status: "fixed" as const } : finding;
  });

  return {
    ...run,
    checks,
    findings: [
      ...findings,
      ...remaining.map((draft) => ({
        ...draft,
        id: randomUUID(),
        snapshotId,
        status: "open" as const,
        proposedPatch: draft.proposedPatch ?? null,
        proposalAttempted: false,
        repairAttempts: 0,
        escalationReason: null,
        decision: null,
        createdAt: now,
      })),
    ],
  };
}

export function computeOutcome(
  run: StoredQaRun,
  rubric: QaRubricPack,
): { stage: QaRunStage; message: string } {
  // QA has done its own work; the template waits for a person's review.
  if (run.target === "lesson" && run.renderApproval?.status === "pending" && run.media === null) {
    const flagged = flaggedForReview(run).length;

    return {
      stage: "awaiting_approval",
      message: `QA finished checking and fixing the template.${flagged > 0 ? ` ${flagged} item(s) are flagged for human review.` : ""} Review it and approve it to start video rendering.`,
    };
  }

  const scripted = scriptOutcome(run, rubric);
  // The stage stays as the script checks left it; the message says why the
  // video could not be checked (a failed render, a request or a read).
  const outcome =
    run.media?.status === "failed" && run.media.message
      ? { ...scripted, message: `${scripted.message} ${run.media.message}` }
      : scripted;

  return run.renderApproval?.status === "approved" && run.renderApproval.renderingOff
    ? {
        ...outcome,
        message: `${outcome.message} Template approved by ${run.renderApproval.decidedBy ?? "a person"}; video rendering is turned off (QA_KYRON_VIDEO), so no video was requested.`,
      }
    : outcome;
}

// Items a person should look at: escalated findings, blocking findings QA
// could not apply, length misfits, checks that need review or could not run,
// and human checks not yet done.
export function flaggedForReview(run: StoredQaRun): string[] {
  return [
    ...run.findings
      .filter((finding) => finding.status === "escalated" || isUnresolvedBlocking(finding))
      .map((finding) => finding.id),
    ...run.findings
      .filter((finding) => finding.evaluator === "length" && finding.status === "open")
      .map((finding) => finding.id),
    ...run.checks
      .filter((check) => check.evaluator !== "length" && (check.status === "needs_review" || check.status === "not_tested"))
      .map((check) => check.id),
    ...run.humanChecks.filter((check) => check.status === "pending").map((check) => check.criterionId),
  ];
}

function scriptOutcome(
  run: StoredQaRun,
  rubric: QaRubricPack,
): { stage: QaRunStage; message: string } {
  const escalated = run.findings.filter((finding) => finding.status === "escalated");
  const unresolved = run.findings.filter(isUnresolvedBlocking);

  if (escalated.length > 0) {
    return {
      stage: "escalated",
      message: `${escalated.length} finding(s) need a person's decision.`,
    };
  }

  if (unresolved.length > 0) {
    return {
      stage: "changes_proposed",
      message: `${unresolved.length} blocking finding(s) remain. Apply the proposed changes in Kyron Studio, then re-import the lesson.`,
    };
  }

  const incomplete = incompleteCriteria(run, rubric);

  if (incomplete.length > 0) {
    return {
      stage: "incomplete",
      message: `No blocking problems found, but these required checks did not complete: ${incomplete.join(", ")}.`,
    };
  }

  if (run.target === "course_setup") {
    return { stage: "passed", message: "The course setup passed every check and is ready for Kyron." };
  }

  // A narration pass counts only for the content it checked: a fix applied
  // after the render leaves the video saying the old text.
  const narrationChecks = run.checks.filter((check) => check.criterionId === "media.narration-match");
  const mediaPassed =
    run.media?.status === "checked" &&
    narrationChecks.length > 0 &&
    narrationChecks.every((check) => check.status === "pass" && check.snapshotId === run.snapshotId);
  const humanPassed = run.humanChecks.every((check) => check.status === "pass");

  if (mediaPassed && humanPassed) {
    return { stage: "verified", message: "Script, video narration and human checks all passed." };
  }

  const remaining = [
    mediaPassed ? null : "video narration check",
    humanPassed ? null : "human checks",
  ].filter(Boolean);

  return {
    stage: "passed",
    message: `Automated script checks passed. Still needed for verification: ${remaining.join(" and ")}.`,
  };
}

export function stageForStep(step: QaStep): QaRunStage {
  switch (step.kind) {
    case "snapshot":
      return "snapshot";
    case "check":
    case "decide":
      return "checking";
    case "revise":
    case "verify":
    case "recheck":
      return "repairing";
    case "video_request":
    case "video_poll":
      return "video";
    case "media_check":
      return "media_check";
    case "finalize":
      return "checking";
  }
}

function incompleteCriteria(run: StoredQaRun, rubric: QaRubricPack): string[] {
  return rubric.criteria
    .filter(
      (criterion) =>
        criterion.target === run.target &&
        criterion.required &&
        criterion.evaluator !== "human" &&
        criterion.evaluator !== "media",
    )
    .filter((criterion) => {
      const checks = run.checks.filter((check) => check.criterionId === criterion.id);

      return (
        checks.length === 0 ||
        checks.some((check) => check.status === "not_tested" || check.status === "needs_review")
      );
    })
    .map((criterion) => criterion.title);
}

function sameLocation(
  draft: EvaluationOutput["findings"][number],
  finding: QaFinding,
): boolean {
  return (
    draft.criterionId === finding.criterionId &&
    draft.activityId === finding.activityId &&
    draft.fieldPath === finding.fieldPath
  );
}

function addToUsage(usage: QaUsage, record: UsageRecord): QaUsage {
  return {
    calls: usage.calls + 1,
    inputTokens: usage.inputTokens + record.inputTokens,
    outputTokens: usage.outputTokens + record.outputTokens,
    reasoningTokens: usage.reasoningTokens + record.reasoningTokens,
  };
}

function emptyUsage(): QaUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

function tokenBudget(): number {
  const value = Number(process.env.QA_RUN_TOKEN_BUDGET);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TOKEN_BUDGET;
}
