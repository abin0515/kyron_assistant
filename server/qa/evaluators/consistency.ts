import "server-only";

import type { QaActivity } from "@/types/api";

import { objectSchema, runStructuredModel } from "../model";
import { renderActivity, selectActivities } from "./lesson-text";
import {
  activityContainsQuote,
  FIELD_PATH_SCHEMA,
  parseItems,
  readEnum,
  readString,
} from "./parsing";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
} from "./types";

type Conflict = {
  activityId: string;
  fieldPath: string;
  quote: string;
  conflictingFieldPath: string;
  conflictingQuote: string;
  explanation: string;
  severity: "critical" | "major" | "minor";
};

const SCHEMA = objectSchema({
  conflicts: {
    type: "array",
    items: objectSchema({
      activityId: { type: "string" },
      fieldPath: FIELD_PATH_SCHEMA,
      quote: { type: "string" },
      conflictingFieldPath: FIELD_PATH_SCHEMA,
      conflictingQuote: { type: "string" },
      explanation: { type: "string" },
      severity: { type: "string", enum: ["critical", "major", "minor"] },
    }),
  },
});

const INSTRUCTIONS = `
Within each activity, compare its representations: narration, on-screen text, question, answer key, rationale and tutor guidance. Report places where two of them disagree in meaning: a different fact, number or definition; a key that the narration or rationale contradicts; tutor guidance that would accept a wrong answer or reject the keyed one.

Set fieldPath to the field that should change and quote both sides exactly. Use "critical" when a learner would be taught or graded on something false, "major" for misleading disagreement, and "minor" for small wording mismatches. Different phrasing of the same idea is not a conflict.
`.trim();

export async function evaluateConsistency({
  activityIds,
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const activities = selectActivities(snapshot, activityIds);
  const comparable = activities.filter((activity) => populatedFieldCount(activity) >= 2);

  if (comparable.length === 0) {
    return { checks: activities.map((activity) => notApplicable(activity.id)), findings: [], usage: [] };
  }

  const { value: conflicts, usage } = await runStructuredModel({
    purpose: "qa.consistency",
    schemaName: "cross_field_conflicts",
    schema: SCHEMA,
    instructions: INSTRUCTIONS,
    input: [
      "<<<LESSON ACTIVITIES (untrusted)",
      ...comparable.map((activity) => renderActivity(activity, true)),
      "ACTIVITIES END>>>",
    ].join("\n\n"),
    parse: (value) => parseItems(value, "conflicts", parseConflict),
  });
  const verified = conflicts.filter((conflict) => {
    const activity = comparable.find((candidate) => candidate.id === conflict.activityId);

    return (
      activity !== undefined &&
      activityContainsQuote(activity, conflict.fieldPath, conflict.quote) &&
      activityContainsQuote(activity, conflict.conflictingFieldPath, conflict.conflictingQuote)
    );
  });

  return {
    checks: activities.map((activity) =>
      comparable.includes(activity) ? activityCheck(activity.id, verified) : notApplicable(activity.id),
    ),
    findings: verified.map(conflictFinding),
    usage: [usage],
  };
}

function activityCheck(activityId: string, conflicts: Conflict[]): CheckDraft {
  const own = conflicts.filter((conflict) => conflict.activityId === activityId);
  const serious = own.filter((conflict) => conflict.severity !== "minor");

  return {
    criterionId: "consistency.cross-field",
    evaluator: "consistency",
    activityId,
    status: serious.length > 0 ? "fail" : "pass",
    summary:
      serious.length > 0
        ? `${serious.length} field(s) disagree in meaning.`
        : own.length > 0
          ? `${own.length} minor wording mismatch(es).`
          : "Fields agree.",
  };
}

function conflictFinding(conflict: Conflict): FindingDraft {
  return {
    criterionId: "consistency.cross-field",
    evaluator: "consistency",
    activityId: conflict.activityId,
    fieldPath: conflict.fieldPath,
    severity: conflict.severity,
    observedText: conflict.quote,
    expectedBehavior: `Agrees with ${conflict.conflictingFieldPath}.`,
    rationale: conflict.explanation,
    evidence: [
      { kind: "lesson", label: conflict.fieldPath, quote: conflict.quote },
      { kind: "lesson", label: conflict.conflictingFieldPath, quote: conflict.conflictingQuote },
    ],
    retest: "Re-compare every field of this activity.",
  };
}

function populatedFieldCount(activity: QaActivity): number {
  return [
    activity.narration,
    activity.onScreenText,
    activity.question?.prompt,
    activity.tutorGuidance,
  ].filter(Boolean).length;
}

function notApplicable(activityId: string): CheckDraft {
  return {
    criterionId: "consistency.cross-field",
    evaluator: "consistency",
    activityId,
    status: "not_applicable",
    summary: "Only one field to compare.",
  };
}

function parseConflict(record: Record<string, unknown>): Conflict | null {
  const activityId = readString(record, "activityId");
  const fieldPath = readString(record, "fieldPath");
  const quote = readString(record, "quote");
  const conflictingFieldPath = readString(record, "conflictingFieldPath");
  const conflictingQuote = readString(record, "conflictingQuote");
  const explanation = readString(record, "explanation");
  const severity = readEnum(record, "severity", ["critical", "major", "minor"] as const);

  return activityId && fieldPath && quote && conflictingFieldPath && conflictingQuote && explanation && severity
    ? { activityId, fieldPath, quote, conflictingFieldPath, conflictingQuote, explanation, severity }
    : null;
}
