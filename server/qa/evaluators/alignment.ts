import "server-only";

import { nullableString, objectSchema, runStructuredModel } from "../model";
import { renderLesson } from "./lesson-text";
import {
  activityContainsQuote,
  FIELD_PATH_SCHEMA,
  parseItems,
  readEnum,
  readString,
  readStrings,
} from "./parsing";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
} from "./types";

type ObjectiveCoverage = {
  objective: string;
  coverage: "covered" | "partial" | "missing";
  teachingActivityIds: string[];
  practiceActivityIds: string[];
  explanation: string;
};

type AudienceIssue = {
  activityId: string;
  fieldPath: string;
  quote: string;
  problem: string;
  suggestion: string;
  severity: "major" | "minor";
  kind: "audience" | "prerequisite";
};

type AlignmentResult = {
  objectives: ObjectiveCoverage[];
  issues: AudienceIssue[];
};

const ISSUE_SCHEMA = objectSchema({
  activityId: { type: "string" },
  fieldPath: FIELD_PATH_SCHEMA,
  quote: { type: "string" },
  problem: { type: "string" },
  suggestion: { type: "string" },
  severity: { type: "string", enum: ["major", "minor"] },
  kind: { type: "string", enum: ["audience", "prerequisite"] },
});

const SCHEMA = objectSchema({
  objectives: {
    type: "array",
    items: objectSchema({
      objective: { type: "string" },
      coverage: { type: "string", enum: ["covered", "partial", "missing"] },
      teachingActivityIds: { type: "array", items: { type: "string" } },
      practiceActivityIds: { type: "array", items: { type: "string" } },
      explanation: { type: "string" },
    }),
  },
  issues: { type: "array", items: ISSUE_SCHEMA },
  notes: nullableString,
});

const INSTRUCTIONS = `
You review a generated lesson for objective alignment and audience fit.

1. For each learning objective, decide whether the lesson teaches it (instruction) and then lets learners practice or demonstrate it (question, conversation or scenario). "covered" needs both; "partial" has only one; "missing" has neither. List the activity ids you relied on.
2. Report audience problems: language, examples or difficulty that do not fit the audience guidance. Use kind "audience".
3. Report prerequisite gaps: a concept the learner must already know that is used before (or without) being introduced. Use kind "prerequisite" and severity "major".

Quote the exact words from the lesson for every issue. Report only real problems; acceptable stylistic variation is not an issue.
`.trim();

export async function evaluateAlignment({
  rubric,
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const objectives = snapshot.lesson.learningObjectives;

  if (objectives.length === 0) {
    return {
      checks: [
        lessonCheck("alignment.objective-coverage", "not_tested", "No learning objectives were supplied."),
        lessonCheck("pedagogy.audience-fit", "not_tested", "Not checked because objectives and audience are needed for context."),
      ],
      findings: [],
      usage: [],
    };
  }

  const { value, usage } = await runStructuredModel({
    purpose: "qa.alignment",
    schemaName: "alignment_review",
    schema: SCHEMA,
    instructions: INSTRUCTIONS,
    input: [
      `AUDIENCE GUIDANCE (${rubric.name}): ${rubric.audienceGuidance}`,
      renderLesson(snapshot, { includeAnswerKeys: false }),
    ].join("\n\n"),
    parse: parseAlignment,
  });
  const verifiedIssues = value.issues.filter((issue) => {
    const activity = snapshot.activities.find((candidate) => candidate.id === issue.activityId);

    return activity ? activityContainsQuote(activity, issue.fieldPath, issue.quote) : false;
  });

  return {
    checks: [objectiveCheck(value.objectives), audienceCheck(verifiedIssues)],
    findings: [
      ...value.objectives
        .filter((objective) => objective.coverage !== "covered")
        .map(objectiveFinding),
      ...verifiedIssues.map(issueFinding),
    ],
    usage: [usage],
  };
}

function objectiveCheck(objectives: ObjectiveCoverage[]): CheckDraft {
  const missing = objectives.filter((objective) => objective.coverage === "missing");
  const partial = objectives.filter((objective) => objective.coverage === "partial");

  if (missing.length > 0) {
    return lessonCheck("alignment.objective-coverage", "fail", `${missing.length} objective(s) have no coverage.`);
  }

  if (partial.length > 0) {
    return lessonCheck("alignment.objective-coverage", "needs_review", `${partial.length} objective(s) are only partly covered.`);
  }

  return lessonCheck("alignment.objective-coverage", "pass", "Every objective is taught and practiced.");
}

function audienceCheck(issues: AudienceIssue[]): CheckDraft {
  const major = issues.filter((issue) => issue.severity === "major");

  return major.length > 0
    ? lessonCheck("pedagogy.audience-fit", "fail", `${major.length} major audience or prerequisite problem(s).`)
    : lessonCheck(
        "pedagogy.audience-fit",
        "pass",
        issues.length > 0 ? `${issues.length} minor wording issue(s).` : "Fits the audience.",
      );
}

function objectiveFinding(objective: ObjectiveCoverage): FindingDraft {
  return {
    criterionId: "alignment.objective-coverage",
    evaluator: "alignment",
    activityId: null,
    fieldPath: null,
    severity: objective.coverage === "missing" ? "major" : "minor",
    observedText: objective.objective,
    expectedBehavior: "The objective is taught and then practiced or assessed.",
    rationale: objective.explanation,
    evidence: [
      {
        kind: "model",
        label: `Coverage: ${objective.coverage}`,
        quote: `Teaching: ${objective.teachingActivityIds.join(", ") || "none"}; practice: ${objective.practiceActivityIds.join(", ") || "none"}`,
      },
    ],
    retest: "Re-check objective coverage across the lesson.",
  };
}

function issueFinding(issue: AudienceIssue): FindingDraft {
  return {
    criterionId: "pedagogy.audience-fit",
    evaluator: "alignment",
    activityId: issue.activityId,
    fieldPath: issue.fieldPath,
    severity: issue.severity,
    observedText: issue.quote,
    expectedBehavior: issue.suggestion,
    rationale: issue.problem,
    evidence: [{ kind: "lesson", label: issue.fieldPath, quote: issue.quote }],
    retest:
      issue.kind === "prerequisite"
        ? "Confirm the prerequisite is introduced before it is used."
        : "Re-check this text against the audience guidance.",
  };
}

function lessonCheck(
  criterionId: string,
  status: CheckDraft["status"],
  summary: string,
): CheckDraft {
  return { criterionId, evaluator: "alignment", activityId: null, status, summary };
}

function parseAlignment(value: unknown): AlignmentResult | null {
  const objectives = parseItems(value, "objectives", (record) => {
    const objective = readString(record, "objective");
    const coverage = readEnum(record, "coverage", ["covered", "partial", "missing"] as const);
    const explanation = readString(record, "explanation");

    return objective && coverage && explanation !== null
      ? {
          objective,
          coverage,
          explanation,
          teachingActivityIds: readStrings(record, "teachingActivityIds"),
          practiceActivityIds: readStrings(record, "practiceActivityIds"),
        }
      : null;
  });
  const issues = parseItems(value, "issues", (record) => {
    const activityId = readString(record, "activityId");
    const fieldPath = readString(record, "fieldPath");
    const quote = readString(record, "quote");
    const problem = readString(record, "problem");
    const suggestion = readString(record, "suggestion");
    const severity = readEnum(record, "severity", ["major", "minor"] as const);
    const kind = readEnum(record, "kind", ["audience", "prerequisite"] as const);

    return activityId && fieldPath && quote && problem && suggestion !== null && severity && kind
      ? { activityId, fieldPath, quote, problem, suggestion, severity, kind }
      : null;
  });

  return objectives && issues ? { objectives, issues } : null;
}
