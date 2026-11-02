import "server-only";

import type { QaDomain, QaRubricCriterion, QaRubricPack, QaRunTarget } from "@/types/api";

import { getRubricApproval, saveRubricApproval } from "./repository";

// Rubric v1 is a draft built from the QA proposal's seven dimensions. The
// curriculum owner approves it in the app; known defects will refine it.
export const RUBRIC_VERSION = "v1";

const CRITERIA: QaRubricCriterion[] = [
  {
    target: "course_setup",
    id: "setup.source-fidelity",
    title: "Setup matches the source",
    dimension: "setup",
    evaluator: "course_setup",
    requirement:
      "The description and learning objective describe what the source material actually teaches, without invented topics, claims or scope.",
    releaseBlocker: "The setup promises content the source does not support.",
    required: true,
  },
  {
    target: "course_setup",
    id: "setup.objective-measurable",
    title: "Objective is measurable",
    dimension: "setup",
    evaluator: "course_setup",
    requirement:
      "One specific learning objective with an observable action verb that a learner can achieve within the chosen duration.",
    releaseBlocker: "The objective is vague, unmeasurable or several objectives in one.",
    required: true,
  },
  {
    target: "course_setup",
    id: "setup.audience-grounded",
    title: "Audience is grounded",
    dimension: "setup",
    evaluator: "course_setup",
    requirement:
      "The audience matches who the source is written for and does not invent an employer, institution, credential or prerequisite.",
    releaseBlocker: "The audience contradicts the source or invents requirements.",
    required: true,
  },
  {
    target: "course_setup",
    id: "setup.scope-fit",
    title: "Duration and type fit",
    dimension: "setup",
    evaluator: "course_setup",
    requirement:
      "The duration fits the amount of material needed for the objective, and the asset type (lesson, practice, scenario) fits how the material should be learned.",
    releaseBlocker: "The lesson is far too short or too long for its objective.",
    required: true,
  },
  {
    target: "course_setup",
    id: "setup.title-clear",
    title: "Title is clear",
    dimension: "setup",
    evaluator: "course_setup",
    requirement: "The title is specific, accurate for the content, and free of filler.",
    releaseBlocker: "The title misrepresents the content.",
    required: true,
  },
  {
    target: "lesson",
    id: "structure.required-fields",
    title: "Required content is present",
    dimension: "structure",
    evaluator: "structural",
    requirement:
      "Each activity has the content its type needs: narration or on-screen text, a question with options and an answer key, and tutor guidance for conversations and scenarios.",
    releaseBlocker: "A required activity is missing content, so it cannot be checked or delivered.",
    required: true,
  },
  {
    target: "lesson",
    id: "structure.no-placeholders",
    title: "No placeholder text",
    dimension: "structure",
    evaluator: "structural",
    requirement: "No template or placeholder text such as TODO, lorem ipsum, [insert …] or {{…}}.",
    releaseBlocker: "Placeholder text would reach learners.",
    required: true,
  },
  {
    target: "lesson",
    id: "structure.question-integrity",
    title: "Questions are well formed",
    dimension: "structure",
    evaluator: "structural",
    requirement:
      "Multiple-choice questions have at least two distinct, non-empty options, and every answer-key entry names an existing option.",
    releaseBlocker: "The answer key points to an option that does not exist.",
    required: true,
  },
  {
    target: "lesson",
    id: "alignment.objective-coverage",
    title: "Objectives are covered",
    dimension: "alignment",
    evaluator: "alignment",
    requirement:
      "Every learning objective is taught and then practiced or assessed somewhere in the lesson.",
    releaseBlocker: "A required objective has no meaningful coverage.",
    required: true,
  },
  {
    target: "lesson",
    id: "pedagogy.audience-fit",
    title: "Fits the audience",
    dimension: "pedagogy",
    evaluator: "alignment",
    requirement:
      "Language, examples and difficulty fit the audience, and required prior knowledge is introduced before it is used.",
    releaseBlocker: "Required prior knowledge is never introduced.",
    required: true,
  },
  {
    target: "lesson",
    id: "assessment.key-correct",
    title: "Answer keys are correct",
    dimension: "assessment",
    evaluator: "assessment",
    requirement:
      "Solving each question without seeing the key arrives at the keyed answer.",
    releaseBlocker: "A question has the wrong answer key.",
    required: true,
  },
  {
    target: "lesson",
    id: "assessment.single-best-answer",
    title: "One defensible answer",
    dimension: "assessment",
    evaluator: "assessment",
    requirement:
      "Single-answer questions have exactly one defensible answer, unambiguous wording, and plausible but wrong distractors.",
    releaseBlocker: "A single-answer question has more than one defensible answer.",
    required: true,
  },
  {
    target: "lesson",
    id: "accuracy.claims-supported",
    title: "Claims match the references",
    dimension: "accuracy",
    evaluator: "fidelity",
    requirement:
      "Material claims, definitions and worked examples are supported by the approved references and never contradicted by them.",
    releaseBlocker: "The lesson teaches a false central concept.",
    required: true,
  },
  {
    target: "lesson",
    id: "consistency.cross-field",
    title: "Fields agree with each other",
    dimension: "consistency",
    evaluator: "consistency",
    requirement:
      "Narration, on-screen text, questions, answer keys and tutor guidance agree with each other.",
    releaseBlocker: "Narration contradicts the explanation or the answer key.",
    required: true,
  },
  {
    target: "lesson",
    id: "media.narration-match",
    title: "Video speech matches the script",
    dimension: "media",
    evaluator: "media",
    requirement:
      "The rendered video's speech matches the approved narration in meaning, with no missing or extra instruction.",
    releaseBlocker: "A required clip is silent or says something different from the script.",
    required: false,
  },
  {
    target: "lesson",
    id: "media.visuals",
    title: "Visuals are readable",
    dimension: "media",
    evaluator: "human",
    requirement:
      "Watching the rendered lesson: text and formulas are readable and not clipped, assets are present, and navigation works.",
    releaseBlocker: "A formula is clipped or a required asset is missing.",
    required: true,
  },
  {
    target: "lesson",
    id: "tutor.runtime-behavior",
    title: "Tutor behaves correctly",
    dimension: "tutor",
    evaluator: "human",
    requirement:
      "In a Kyron preview, the tutor accepts correct paraphrases, diagnoses a common misconception, stays on task, and ends the activity sensibly.",
    releaseBlocker: "The tutor accepts a core misconception or keeps rejecting a correct answer.",
    required: true,
  },
];

const DOMAIN_PACKS: Record<QaDomain, Omit<QaRubricPack, "approval" | "criteria">> = {
  cpe: {
    domain: "cpe",
    name: "Stevens CPE courses",
    version: RUBRIC_VERSION,
    audienceGuidance:
      "Working professionals in continuing education. Expect practical, job-relevant examples, concise explanations, and respect for prior professional experience. Approved references are the course's source material.",
  },
  "hs-ai": {
    domain: "hs-ai",
    name: "High-school AI lessons (M1/M2)",
    version: RUBRIC_VERSION,
    audienceGuidance:
      "High-school students learning AI. Use age-appropriate language, define technical terms on first use, assume no math beyond algebra, and use relatable examples.",
  },
};

export const QA_DOMAINS: readonly QaDomain[] = ["cpe", "hs-ai"];

export async function getRubricPack(domain: QaDomain): Promise<QaRubricPack> {
  const approval = await getRubricApproval(domain, RUBRIC_VERSION);

  return {
    ...DOMAIN_PACKS[domain],
    criteria: CRITERIA,
    approval: approval
      ? { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt }
      : null,
  };
}

export async function listRubricPacks(): Promise<QaRubricPack[]> {
  return Promise.all(QA_DOMAINS.map((domain) => getRubricPack(domain)));
}

export async function approveRubricPack(
  domain: QaDomain,
  approvedBy: string,
): Promise<QaRubricPack> {
  await saveRubricApproval({
    domain,
    version: RUBRIC_VERSION,
    approvedBy,
    approvedAt: new Date().toISOString(),
  });

  return getRubricPack(domain);
}

export function criterionById(id: string): QaRubricCriterion | undefined {
  return CRITERIA.find((criterion) => criterion.id === id);
}

export function criteriaForTarget(
  criteria: QaRubricCriterion[],
  target: QaRunTarget,
): QaRubricCriterion[] {
  return criteria.filter((criterion) => criterion.target === target);
}

export function isQaDomain(value: unknown): value is QaDomain {
  return value === "cpe" || value === "hs-ai";
}
