import "server-only";

import type { QaActivity } from "@/types/api";

import { readActivityField } from "../snapshot";
import { truncate } from "./lesson-text";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
} from "./types";

const PLACEHOLDER_PATTERN =
  /\b(TODO|TBD|FIXME|lorem ipsum)\b|\[(insert|add|placeholder)[^\]]*\]|\{\{[^}]*\}\}|\bXXX\b/i;
const PLACEHOLDER_FIELDS = [
  "narration",
  "onScreenText",
  "tutorGuidance",
  "question.prompt",
  "question.rationale",
] as const;

// Exact rules that need no model. Always runs on the whole lesson.
export async function evaluateStructure({
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const checks: CheckDraft[] = [];
  const findings: FindingDraft[] = [];

  for (const activity of snapshot.activities) {
    const missing = snapshot.missingFields.filter(
      (field) => field.activityId === activity.id,
    );
    const placeholders = findPlaceholders(activity);
    const integrityProblems = findQuestionProblems(activity);

    checks.push(
      check("structure.required-fields", activity.id, missing.length === 0 ? "pass" : "fail",
        missing.length === 0
          ? "Required content is present."
          : `Missing: ${missing.map((field) => field.field).join(", ")}.`),
      check("structure.no-placeholders", activity.id, placeholders.length === 0 ? "pass" : "fail",
        placeholders.length === 0
          ? "No placeholder text found."
          : `Placeholder text in ${placeholders.map((item) => item.fieldPath).join(", ")}.`),
      check(
        "structure.question-integrity",
        activity.id,
        !activity.question || activity.question.options.length === 0
          ? "not_applicable"
          : integrityProblems.length === 0
            ? "pass"
            : "fail",
        integrityProblems[0]?.message ?? "Question structure is valid.",
      ),
    );

    findings.push(
      ...missing.map((field) =>
        finding({
          criterionId: "structure.required-fields",
          activityId: activity.id,
          fieldPath: field.field,
          severity: "major",
          observedText: null,
          expectedBehavior: `The ${activity.type} activity needs ${field.field}.`,
          rationale: `The imported lesson has no ${field.field} for this activity, so it cannot be checked or delivered.`,
          quote: `Missing field: ${field.field}`,
        }),
      ),
      ...placeholders.map((item) =>
        finding({
          criterionId: "structure.no-placeholders",
          activityId: activity.id,
          fieldPath: item.fieldPath,
          severity: "major",
          observedText: item.text,
          expectedBehavior: "Finished learner-facing text with no template placeholders.",
          rationale: `"${item.match}" looks like unfinished template text.`,
          quote: item.match,
        }),
      ),
      ...integrityProblems.map((problem) =>
        finding({
          criterionId: "structure.question-integrity",
          activityId: activity.id,
          fieldPath: problem.fieldPath,
          severity: problem.severity,
          observedText: problem.observed,
          expectedBehavior: problem.expected,
          rationale: problem.message,
          quote: problem.observed ?? problem.message,
        }),
      ),
    );
  }

  return { checks, findings, usage: [] };
}

function findPlaceholders(activity: QaActivity) {
  return PLACEHOLDER_FIELDS.flatMap((fieldPath) => {
    const text = readActivityField(activity, fieldPath);
    const match = text?.match(PLACEHOLDER_PATTERN);

    return text && match ? [{ fieldPath, text: truncate(text, 400), match: match[0] }] : [];
  });
}

function findQuestionProblems(activity: QaActivity) {
  const question = activity.question;
  const problems: Array<{
    fieldPath: string;
    severity: "critical" | "major";
    message: string;
    observed: string | null;
    expected: string;
  }> = [];

  if (!question || question.options.length === 0) {
    return problems;
  }

  const optionIds = question.options.map((option) => option.id);
  const optionTexts = question.options.map((option) => option.text.trim().toLowerCase());

  if (question.options.length < 2) {
    problems.push({
      fieldPath: "question.prompt",
      severity: "major",
      message: "A multiple-choice question needs at least two options.",
      observed: `${question.options.length} option`,
      expected: "Two or more distinct options.",
    });
  }

  if (optionTexts.some((text) => !text)) {
    problems.push({
      fieldPath: "question.prompt",
      severity: "major",
      message: "One or more answer options are empty.",
      observed: null,
      expected: "Every option has text.",
    });
  }

  if (new Set(optionTexts).size !== optionTexts.length || new Set(optionIds).size !== optionIds.length) {
    problems.push({
      fieldPath: "question.prompt",
      severity: "major",
      message: "Two answer options are identical.",
      observed: question.options.map((option) => `${option.id}: ${option.text}`).join(" | "),
      expected: "Distinct options with unique ids.",
    });
  }

  const unknownKeys = question.answerKey.filter((key) => !optionIds.includes(key));

  if (unknownKeys.length > 0) {
    problems.push({
      fieldPath: "question.answerKey",
      severity: "critical",
      message: `The answer key names options that do not exist: ${unknownKeys.join(", ")}.`,
      observed: question.answerKey.join(", "),
      expected: `Answer key entries from: ${optionIds.join(", ")}.`,
    });
  }

  return problems;
}

function check(
  criterionId: string,
  activityId: string,
  status: CheckDraft["status"],
  summary: string,
): CheckDraft {
  return { criterionId, evaluator: "structural", activityId, status, summary };
}

function finding({
  activityId,
  criterionId,
  expectedBehavior,
  fieldPath,
  observedText,
  quote,
  rationale,
  severity,
}: {
  activityId: string;
  criterionId: string;
  expectedBehavior: string;
  fieldPath: string;
  observedText: string | null;
  quote: string;
  rationale: string;
  severity: FindingDraft["severity"];
}): FindingDraft {
  return {
    criterionId,
    evaluator: "structural",
    activityId,
    fieldPath,
    severity,
    observedText,
    expectedBehavior,
    rationale,
    evidence: [{ kind: "rule", label: criterionId, quote }],
    retest: "Re-run the structural rules on this activity.",
  };
}
