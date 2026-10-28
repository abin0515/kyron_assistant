import type { CourseSetup } from "@/types/api";

export type CourseSetupGenerationClaimResult =
  | "claimed"
  | "not_found"
  | "locked"
  | "in_progress"
  | "batch_workspace";

export type CourseSetupGenerationResult = {
  setup: CourseSetup;
  promptVersion: string;
  model: string;
};
