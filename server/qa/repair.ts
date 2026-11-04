import "server-only";

import type { QaFinding, QaLesson, QaPatchProposal } from "@/types/api";

import type { LessonContentSource } from "./content-sources";

export const MAX_REPAIR_ATTEMPTS = 2;

export type AutonomyPolicy = "auto" | "propose_only";

export type RepairDecision =
  | { action: "apply" }
  | { action: "propose_only"; reason: string }
  | { action: "escalate"; reason: string };

export function autonomyPolicy(): AutonomyPolicy {
  return process.env.QA_AUTONOMY_POLICY?.trim() === "propose_only" ? "propose_only" : "auto";
}

// Every proposed fix applies automatically when the content can be written,
// critical findings and protected fields included: each one is read back,
// checked by the independent verifier and re-checked. Only the emergency
// switch QA_AUTONOMY_POLICY=propose_only holds fixes back.
export function decideRepair(
  finding: Pick<QaFinding, "status" | "proposedPatch">,
  { policy, writable }: { policy: AutonomyPolicy; writable: boolean },
): RepairDecision {
  if (!finding.proposedPatch) {
    return { action: "escalate", reason: "No automatic fix could be proposed." };
  }

  if (!writable) {
    return {
      action: "propose_only",
      reason: "Apply the proposed change in Kyron Studio, then re-import the lesson.",
    };
  }

  if (finding.status === "accepted") {
    return { action: "apply" };
  }

  if (policy === "propose_only") {
    return {
      action: "escalate",
      reason: "Automatic fixes are turned off (QA_AUTONOMY_POLICY=propose_only).",
    };
  }

  return { action: "apply" };
}

export type PatchResult =
  | { status: "applied" }
  | { status: "conflict" | "verify_failed"; message: string };

// Re-reads the field before writing so a concurrent edit is never overwritten,
// then re-reads after writing to confirm Kyron stored the intended value.
export async function applyPatch(
  source: LessonContentSource,
  lesson: QaLesson,
  proposal: QaPatchProposal,
): Promise<PatchResult> {
  const activityId = proposal.activityId ?? "";
  const before = await source.readField(lesson, activityId, proposal.fieldPath);

  if (!sameText(before, proposal.currentValue)) {
    return {
      status: "conflict",
      message: "The field changed since it was checked, so the fix was not applied.",
    };
  }

  await source.writeField(lesson, activityId, proposal.fieldPath, proposal.proposedValue);

  const after = await source.readField(lesson, activityId, proposal.fieldPath);

  return sameText(after, proposal.proposedValue)
    ? { status: "applied" }
    : {
        status: "verify_failed",
        message: "After writing, the field did not contain the proposed value.",
      };
}

function sameText(left: string | null, right: string): boolean {
  return (left ?? "").replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}
