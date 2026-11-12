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
const ACTIVITY_TEXT_FIELDS = [
  "narration",
  "onScreenText",
  "tutorGuidance",
  "question.prompt",
  "question.rationale",
] as const;
// Fields joined from the scenes; with scenes, each scene is checked instead.
const JOINED_FIELDS = new Set<string>(["narration", "onScreenText"]);
const SCENE_TEXT_FIELDS = ["narration", "onScreenText", "title"] as const;

// Text that is not real language: test strings, keyboard runs, letter runs.
const TEST_TEXT =
  /^(test(ing)?( test(ing)?)*|asdf|abc|xyz|blah( blah)*|foo( bar)?|sample text|(your )?text here)$/;
const KEYBOARD_RUN = /asdf|qwer|zxcv|hjkl/;
const ONE_LETTER_REPEATED = /^([a-z])\1{3,}$/;
const QUOTED = /"[^"]*"|\u201c[^\u201d]*\u201d|`[^`]*`/g;

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
    const placeholders = findUnfinishedText(activity);
    const integrityProblems = findQuestionProblems(activity);

    checks.push(
      check("structure.required-fields", activity.id, missing.length === 0 ? "pass" : "fail",
        missing.length === 0
          ? "Required content is present."
          : `Missing: ${missing.map((field) => field.field).join(", ")}.`),
      check("structure.no-placeholders", activity.id, placeholders.length === 0 ? "pass" : "fail",
        placeholders.length === 0
          ? "No placeholder or nonsense text found."
          : `Placeholder or nonsense text in ${placeholders.map((item) => item.fieldPath).join(", ")}.`),
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
          expectedBehavior: item.nonsense
            ? "Real instructional text that fits the scene and the lesson."
            : "Finished learner-facing text with no template placeholders.",
          rationale: item.nonsense
            ? `"${item.match}" is not real text; learners would ${item.spoken ? "hear" : "see"} it.`
            : `"${item.match}" looks like unfinished template text.`,
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

// Placeholders and nonsense in learner-facing text, one per field. Kyron
// lessons are checked scene by scene so the finding names the exact scene.
function findUnfinishedText(activity: QaActivity) {
  const scenes = activity.scenes ?? [];
  const fieldPaths = [
    ...ACTIVITY_TEXT_FIELDS.filter((fieldPath) => scenes.length === 0 || !JOINED_FIELDS.has(fieldPath)),
    ...scenes.flatMap((scene) => SCENE_TEXT_FIELDS.map((field) => `scenes.${scene.id}.${field}`)),
  ];

  return fieldPaths.flatMap((fieldPath) => {
    const text = readActivityField(activity, fieldPath);

    if (!text) {
      return [];
    }

    const spoken = fieldPath.endsWith("narration");
    const placeholder = text.match(PLACEHOLDER_PATTERN)?.[0] ?? null;
    const match = placeholder ?? nonsenseIn(text, spoken);

    return match
      ? [{ fieldPath, text: truncate(text, 400), match, nonsense: placeholder === null, spoken }]
      : [];
  });
}

// Returns the offending text when a field is not real language: a stock test
// string, spoken narration with no words, or a field where at least half the
// words are letter runs ("abcdef", "cdefgab"), keyboard runs ("asdf") or one
// letter repeated ("aaaa"). Quoted text and capitalised labels such as ABCD
// are left alone, since a lesson can legitimately show them.
export function nonsenseIn(text: string, spoken: boolean): string | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  if (TEST_TEXT.test(trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())) {
    return trimmed;
  }

  if (spoken && !/[a-z]/i.test(trimmed)) {
    return trimmed;
  }

  const words = trimmed.replace(QUOTED, " ").match(/[A-Za-z]+/g) ?? [];
  const single = spoken && words.length === 1;
  const nonsense = words.filter((word) => (single || word !== word.toUpperCase()) && isNonsenseWord(word));

  return nonsense.length > 0 && nonsense.length * 2 >= words.length ? nonsense.join(" ") : null;
}

function isNonsenseWord(word: string): boolean {
  const lower = word.toLowerCase();

  return hasAlphabetRun(lower, 4) || KEYBOARD_RUN.test(lower) || ONE_LETTER_REPEATED.test(lower);
}

// Four or more letters in alphabet order, as in "abcd"; real words have at most three ("first").
function hasAlphabetRun(word: string, length: number): boolean {
  let run = 1;

  for (let index = 1; index < word.length; index += 1) {
    run = word.charCodeAt(index) === word.charCodeAt(index - 1) + 1 ? run + 1 : 1;

    if (run >= length) {
      return true;
    }
  }

  return false;
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
