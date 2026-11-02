import "server-only";

import type { QaLessonSnapshot } from "@/types/api";

import {
  isSetupFieldPath,
  readSetupField,
  SETUP_FIELD_PATHS,
  setupFieldUpdate,
  type SetupFieldPath,
} from "../course-setup-fields";
import { nullableString, objectSchema, runStructuredModel } from "../model";
import { criteriaForTarget } from "../rubrics";
import {
  containsQuote,
  MAX_SETUP_REFERENCE_CHARACTERS,
  renderReferences,
  renderSetup,
} from "./lesson-text";
import { parseItems, readEnum, readString } from "./parsing";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
} from "./types";

const CHECK_STATUSES = ["pass", "fail", "needs_review"] as const;
const SEVERITIES = ["critical", "major", "minor"] as const;

type CriterionVerdict = {
  criterionId: string;
  status: (typeof CHECK_STATUSES)[number];
  summary: string;
};

type SetupIssue = {
  criterionId: string;
  fieldPath: SetupFieldPath;
  severity: (typeof SEVERITIES)[number];
  problem: string;
  evidenceQuote: string | null;
  proposedValue: string | null;
  rationale: string;
};

const INSTRUCTIONS = `
You check a course setup before an AI lesson generator builds a lesson from it. The setup must describe what the source material actually teaches, for the stated audience.

Give a verdict for every listed criterion. For each problem, name the setup field to change, quote the source material exactly as evidence when the problem concerns its content (otherwise null), and propose the complete new value for that field. Durations are 480, 900, 1800 or 3600 seconds; asset types are lesson, practice or scenario.

Use "critical" only when the setup would make the generator teach something false or off-topic, "major" for problems that would noticeably mislead or mis-scope the lesson, and "minor" for polish. Do not report acceptable stylistic choices.
`.trim();

export async function evaluateCourseSetup({
  rubric,
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const criteria = criteriaForTarget(rubric.criteria, "course_setup");
  const criterionIds = criteria.map((criterion) => criterion.id);
  const noReferences = snapshot.references.length === 0;
  const { value, usage } = await runStructuredModel({
    purpose: "qa.course_setup",
    schemaName: "course_setup_review",
    schema: schemaFor(criterionIds),
    instructions: INSTRUCTIONS,
    input: [
      `AUDIENCE GUIDANCE (${rubric.name}): ${rubric.audienceGuidance}`,
      `CRITERIA:\n${criteria.map((criterion) => `- ${criterion.id}: ${criterion.requirement}`).join("\n")}`,
      renderSetup(snapshot),
      noReferences
        ? "SOURCE MATERIAL: none was provided. Judge setup.source-fidelity as needs_review."
        : renderReferences(snapshot.references, MAX_SETUP_REFERENCE_CHARACTERS),
    ].join("\n\n"),
    parse: (output) => parseReview(output, criterionIds),
  });

  return {
    checks: criteria.map((criterion) =>
      criterionCheck(criterion.id, value.verdicts, noReferences),
    ),
    findings: value.issues.flatMap((issue) => issueFinding(issue, snapshot)),
    usage: [usage],
  };
}

function criterionCheck(
  criterionId: string,
  verdicts: CriterionVerdict[],
  noReferences: boolean,
): CheckDraft {
  const verdict = verdicts.find((candidate) => candidate.criterionId === criterionId);

  if (criterionId === "setup.source-fidelity" && noReferences) {
    return check(criterionId, "not_tested", "No source material is linked to this workspace.");
  }

  return verdict
    ? check(criterionId, verdict.status, verdict.summary)
    : check(criterionId, "not_tested", "The check returned no verdict for this criterion.");
}

function issueFinding(issue: SetupIssue, snapshot: QaLessonSnapshot): FindingDraft[] {
  const currentValue = readSetupField(snapshot.lesson, issue.fieldPath) ?? "";
  // Evidence that cannot be found in the sources is not trusted.
  const evidenceVerified =
    issue.evidenceQuote === null ||
    snapshot.references.some((reference) => containsQuote(reference.text, issue.evidenceQuote ?? ""));
  const proposedValue =
    issue.proposedValue && setupFieldUpdate(issue.fieldPath, issue.proposedValue)
      ? issue.proposedValue.trim()
      : null;

  return [
    {
      criterionId: issue.criterionId,
      evaluator: "course_setup",
      activityId: null,
      fieldPath: issue.fieldPath,
      severity: evidenceVerified ? issue.severity : "minor",
      observedText: currentValue,
      expectedBehavior: issue.problem,
      rationale: evidenceVerified
        ? issue.rationale
        : `${issue.rationale} (The cited source passage could not be found, so this is lowered to minor.)`,
      evidence: [
        ...(issue.evidenceQuote && evidenceVerified
          ? [{ kind: "reference" as const, label: "Source material", quote: issue.evidenceQuote }]
          : []),
        { kind: "lesson" as const, label: issue.fieldPath, quote: currentValue || "(empty)" },
      ],
      retest: "Re-check the course setup against the source material.",
      proposedPatch:
        proposedValue && proposedValue !== currentValue.trim()
          ? {
              activityId: null,
              fieldPath: issue.fieldPath,
              currentValue,
              proposedValue,
              rationale: issue.rationale,
              protectedField: false,
            }
          : null,
    },
  ];
}

function schemaFor(criterionIds: string[]) {
  return objectSchema({
    verdicts: {
      type: "array",
      items: objectSchema({
        criterionId: { type: "string", enum: criterionIds },
        status: { type: "string", enum: [...CHECK_STATUSES] },
        summary: { type: "string" },
      }),
    },
    issues: {
      type: "array",
      items: objectSchema({
        criterionId: { type: "string", enum: criterionIds },
        fieldPath: { type: "string", enum: [...SETUP_FIELD_PATHS] },
        severity: { type: "string", enum: [...SEVERITIES] },
        problem: { type: "string" },
        evidenceQuote: nullableString,
        proposedValue: nullableString,
        rationale: { type: "string" },
      }),
    },
  });
}

function check(
  criterionId: string,
  status: CheckDraft["status"],
  summary: string,
): CheckDraft {
  return { criterionId, evaluator: "course_setup", activityId: null, status, summary };
}

function parseReview(
  value: unknown,
  criterionIds: string[],
): { verdicts: CriterionVerdict[]; issues: SetupIssue[] } | null {
  const verdicts = parseItems(value, "verdicts", (record) => {
    const criterionId = readString(record, "criterionId");
    const status = readEnum(record, "status", CHECK_STATUSES);
    const summary = readString(record, "summary");

    return criterionId && criterionIds.includes(criterionId) && status && summary !== null
      ? { criterionId, status, summary }
      : null;
  });
  const issues = parseItems(value, "issues", (record) => {
    const criterionId = readString(record, "criterionId");
    const fieldPath = readString(record, "fieldPath");
    const severity = readEnum(record, "severity", SEVERITIES);
    const problem = readString(record, "problem");
    const rationale = readString(record, "rationale");

    return criterionId &&
      criterionIds.includes(criterionId) &&
      fieldPath &&
      isSetupFieldPath(fieldPath) &&
      severity &&
      problem &&
      rationale !== null
      ? {
          criterionId,
          fieldPath,
          severity,
          problem,
          rationale,
          evidenceQuote: readString(record, "evidenceQuote"),
          proposedValue: readString(record, "proposedValue"),
        }
      : null;
  });

  return verdicts && issues ? { verdicts, issues } : null;
}
