import "server-only";

import type { QaRunTarget } from "@/types/api";

import type { ScriptEvaluatorId } from "../types";
import { evaluateAlignment } from "./alignment";
import { evaluateAssessment } from "./assessment";
import { evaluateConsistency } from "./consistency";
import { evaluateCourseSetup } from "./course-setup";
import { evaluateFidelity } from "./fidelity";
import { evaluateStructure } from "./structural";
import type { EvaluationInput, EvaluationOutput } from "./types";

// Cheap exact rules first, then model checks.
export const SCRIPT_EVALUATOR_ORDER: readonly ScriptEvaluatorId[] = [
  "structural",
  "assessment",
  "fidelity",
  "consistency",
  "alignment",
];

export function evaluatorOrderFor(target: QaRunTarget): readonly ScriptEvaluatorId[] {
  return target === "course_setup" ? ["course_setup"] : SCRIPT_EVALUATOR_ORDER;
}

// These evaluators always review the whole lesson, even after a local repair.
export const LESSON_LEVEL_EVALUATORS: ReadonlySet<ScriptEvaluatorId> = new Set([
  "course_setup",
  "structural",
  "alignment",
]);

export const SCRIPT_EVALUATORS: Record<
  ScriptEvaluatorId,
  (input: EvaluationInput) => Promise<EvaluationOutput>
> = {
  course_setup: evaluateCourseSetup,
  structural: evaluateStructure,
  assessment: evaluateAssessment,
  fidelity: evaluateFidelity,
  consistency: evaluateConsistency,
  alignment: evaluateAlignment,
};

// Which evaluators must re-run after a field changes.
export function evaluatorsAffectedBy(fieldPath: string): ScriptEvaluatorId[] {
  if (fieldPath.startsWith("setup.")) {
    return ["course_setup"];
  }

  if (fieldPath.startsWith("question.")) {
    return ["structural", "assessment", "consistency", "fidelity"];
  }

  if (fieldPath === "tutorGuidance") {
    return ["structural", "consistency"];
  }

  return ["structural", "fidelity", "consistency", "alignment"];
}
