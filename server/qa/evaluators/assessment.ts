import "server-only";

import type { QaActivity } from "@/types/api";

import { nullableString, objectSchema, runStructuredModel } from "../model";
import { renderLesson } from "./lesson-text";
import { parseItems, readEnum, readString, readStrings } from "./parsing";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
  UsageRecord,
} from "./types";

type BlindAnswer = {
  activityId: string;
  chosenOptionIds: string[];
  answerText: string;
  defensibleOptionIds: string[];
  ambiguity: string | null;
};

type Verdict = {
  activityId: string;
  keyVerdict: "key_correct" | "key_wrong" | "ambiguous";
  correctAnswer: string;
  explanation: string;
};

const BLIND_SCHEMA = objectSchema({
  answers: {
    type: "array",
    items: objectSchema({
      activityId: { type: "string" },
      chosenOptionIds: { type: "array", items: { type: "string" } },
      answerText: { type: "string" },
      defensibleOptionIds: { type: "array", items: { type: "string" } },
      ambiguity: nullableString,
    }),
  },
});

const VERDICT_SCHEMA = objectSchema({
  verdicts: {
    type: "array",
    items: objectSchema({
      activityId: { type: "string" },
      keyVerdict: { type: "string", enum: ["key_correct", "key_wrong", "ambiguous"] },
      correctAnswer: { type: "string" },
      explanation: { type: "string" },
    }),
  },
});

const BLIND_INSTRUCTIONS = `
Answer each listed question as an expert would, using the lesson and general subject knowledge. Answer keys are hidden on purpose.

For multiple-choice questions, put the option id(s) you would choose in chosenOptionIds, and list every option that a knowledgeable reader could defend as correct in defensibleOptionIds. For open questions, leave both lists empty and write your answer in answerText. Describe any ambiguous wording in ambiguity, or use null.
`.trim();

const VERDICT_INSTRUCTIONS = `
You adjudicate answer keys. For each listed question you see the official key and an independent answer produced without the key.

Decide whether the key is correct ("key_correct"), wrong ("key_wrong"), or whether the question has more than one defensible answer or is too ambiguous to grade ("ambiguous"). Give the correct answer and a short explanation a reviewer can verify.
`.trim();

export async function evaluateAssessment({
  activityIds,
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const questions = snapshot.activities.filter(
    (activity) =>
      activity.question && (!activityIds || activityIds.includes(activity.id)),
  );
  const gradable = questions.filter((activity) => (activity.question?.answerKey.length ?? 0) > 0);
  const ungradable = questions.filter((activity) => !gradable.includes(activity));

  if (gradable.length === 0) {
    return { checks: ungradable.flatMap(notTestedChecks), findings: [], usage: [] };
  }

  const usage: UsageRecord[] = [];
  const blind = await runStructuredModel({
    purpose: "qa.assessment.blind",
    schemaName: "blind_answers",
    schema: BLIND_SCHEMA,
    instructions: BLIND_INSTRUCTIONS,
    input: [
      renderLesson(snapshot, { includeAnswerKeys: false }),
      `QUESTIONS TO ANSWER: ${gradable.map((activity) => activity.id).join(", ")}`,
    ].join("\n\n"),
    parse: (value) => parseItems(value, "answers", parseBlindAnswer),
  });

  usage.push(blind.usage);

  const disputed = gradable.filter((activity) => {
    const answer = blind.value.find((candidate) => candidate.activityId === activity.id);

    return !answer || needsAdjudication(activity, answer);
  });
  const verdicts = disputed.length > 0 ? await adjudicate(snapshot, disputed, blind.value, usage) : [];

  return {
    checks: [
      ...ungradable.flatMap(notTestedChecks),
      ...gradable.flatMap((activity) =>
        questionChecks(activity, verdicts.find((verdict) => verdict.activityId === activity.id) ?? null),
      ),
    ],
    findings: gradable.flatMap((activity) => {
      const verdict = verdicts.find((candidate) => candidate.activityId === activity.id);
      const answer = blind.value.find((candidate) => candidate.activityId === activity.id);

      return verdict ? verdictFindings(activity, verdict, answer ?? null) : [];
    }),
    usage,
  };
}

function needsAdjudication(activity: QaActivity, answer: BlindAnswer): boolean {
  const question = activity.question;

  if (!question) {
    return false;
  }

  if (question.options.length === 0) {
    return true;
  }

  const key = new Set(question.answerKey);
  const chosen = new Set(answer.chosenOptionIds);
  const agrees = key.size === chosen.size && [...key].every((id) => chosen.has(id));
  const ambiguous = key.size === 1 && answer.defensibleOptionIds.length > 1;

  return !agrees || ambiguous || answer.ambiguity !== null;
}

async function adjudicate(
  snapshot: EvaluationInput["snapshot"],
  disputed: QaActivity[],
  answers: BlindAnswer[],
  usage: UsageRecord[],
): Promise<Verdict[]> {
  const independent = disputed.map((activity) => {
    const answer = answers.find((candidate) => candidate.activityId === activity.id);

    return `[${activity.id}] independent answer: ${
      answer
        ? `${answer.chosenOptionIds.join(", ") || answer.answerText}; defensible options: ${answer.defensibleOptionIds.join(", ") || "n/a"}; ambiguity: ${answer.ambiguity ?? "none"}`
        : "(no answer given)"
    }`;
  });
  const result = await runStructuredModel({
    purpose: "qa.assessment.adjudicate",
    schemaName: "answer_key_verdicts",
    schema: VERDICT_SCHEMA,
    instructions: VERDICT_INSTRUCTIONS,
    input: [
      renderLesson(snapshot, {
        includeAnswerKeys: true,
        activityIds: disputed.map((activity) => activity.id),
      }),
      `INDEPENDENT ANSWERS:\n${independent.join("\n")}`,
    ].join("\n\n"),
    parse: (value) => parseItems(value, "verdicts", parseVerdict),
  });

  usage.push(result.usage);

  return result.value;
}

function questionChecks(activity: QaActivity, verdict: Verdict | null): CheckDraft[] {
  const keyStatus =
    verdict?.keyVerdict === "key_wrong"
      ? "fail"
      : verdict?.keyVerdict === "ambiguous"
        ? "needs_review"
        : "pass";

  return [
    check("assessment.key-correct", activity.id, keyStatus,
      verdict?.keyVerdict === "key_wrong"
        ? "Solved independently, the answer differs from the key."
        : "The independent answer matches the key."),
    check(
      "assessment.single-best-answer",
      activity.id,
      verdict?.keyVerdict === "ambiguous" ? "fail" : "pass",
      verdict?.keyVerdict === "ambiguous"
        ? "More than one answer is defensible or the wording is ambiguous."
        : "One defensible answer.",
    ),
  ];
}

function verdictFindings(
  activity: QaActivity,
  verdict: Verdict,
  answer: BlindAnswer | null,
): FindingDraft[] {
  if (verdict.keyVerdict === "key_correct") {
    return [];
  }

  const key = activity.question?.answerKey.join(", ") ?? "";
  const evidence = [
    {
      kind: "model" as const,
      label: "Answer solved without the key",
      quote: answer ? answer.chosenOptionIds.join(", ") || answer.answerText : "(none)",
    },
    { kind: "model" as const, label: "Adjudication", quote: verdict.explanation },
  ];

  if (verdict.keyVerdict === "key_wrong") {
    return [
      {
        criterionId: "assessment.key-correct",
        evaluator: "assessment",
        activityId: activity.id,
        fieldPath: "question.answerKey",
        severity: "critical",
        observedText: `Answer key: ${key}`,
        expectedBehavior: `Correct answer: ${verdict.correctAnswer}`,
        rationale: verdict.explanation,
        evidence,
        retest: "Re-solve the question without the key and compare with the corrected key, then re-check the narration and tutor guidance.",
      },
    ];
  }

  return [
    {
      criterionId: "assessment.single-best-answer",
      evaluator: "assessment",
      activityId: activity.id,
      fieldPath: "question.prompt",
      severity: "major",
      observedText: activity.question?.prompt ?? null,
      expectedBehavior: "Wording that leaves exactly one defensible answer.",
      rationale: verdict.explanation,
      evidence,
      retest: "Re-solve the question without the key and confirm only one option is defensible.",
    },
  ];
}

function notTestedChecks(activity: QaActivity): CheckDraft[] {
  return [
    check("assessment.key-correct", activity.id, "not_tested", "No answer key was supplied."),
    check("assessment.single-best-answer", activity.id, "not_tested", "No answer key was supplied."),
  ];
}

function check(
  criterionId: string,
  activityId: string,
  status: CheckDraft["status"],
  summary: string,
): CheckDraft {
  return { criterionId, evaluator: "assessment", activityId, status, summary };
}

function parseBlindAnswer(record: Record<string, unknown>): BlindAnswer | null {
  const activityId = readString(record, "activityId");
  const answerText = readString(record, "answerText");

  return activityId && answerText !== null
    ? {
        activityId,
        answerText,
        chosenOptionIds: readStrings(record, "chosenOptionIds"),
        defensibleOptionIds: readStrings(record, "defensibleOptionIds"),
        ambiguity: readString(record, "ambiguity"),
      }
    : null;
}

function parseVerdict(record: Record<string, unknown>): Verdict | null {
  const activityId = readString(record, "activityId");
  const keyVerdict = readEnum(record, "keyVerdict", ["key_correct", "key_wrong", "ambiguous"] as const);
  const correctAnswer = readString(record, "correctAnswer");
  const explanation = readString(record, "explanation");

  return activityId && keyVerdict && correctAnswer !== null && explanation
    ? { activityId, keyVerdict, correctAnswer, explanation }
    : null;
}
