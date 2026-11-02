import type {
  QaCheckResult,
  QaFinding,
  QaLessonSnapshot,
  QaRubricPack,
} from "@/types/api";

export type UsageRecord = {
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type CheckDraft = Pick<
  QaCheckResult,
  "criterionId" | "evaluator" | "activityId" | "status" | "summary"
>;

export type FindingDraft = Pick<
  QaFinding,
  | "criterionId"
  | "evaluator"
  | "activityId"
  | "fieldPath"
  | "severity"
  | "observedText"
  | "expectedBehavior"
  | "rationale"
  | "evidence"
  | "retest"
> & {
  proposedPatch?: QaFinding["proposedPatch"];
};

export type EvaluationInput = {
  snapshot: QaLessonSnapshot;
  rubric: QaRubricPack;
  // Limits model evaluators to these activities after a repair; null means all.
  activityIds: string[] | null;
};

export type EvaluationOutput = {
  checks: CheckDraft[];
  findings: FindingDraft[];
  usage: UsageRecord[];
};
