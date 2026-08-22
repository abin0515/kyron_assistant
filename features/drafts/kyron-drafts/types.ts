import type { Draft } from "@/types/api";

export type DraftPollingPhase =
  | "idle"
  | "checking"
  | "generating"
  | "complete"
  | "generation_error"
  | "unavailable"
  | "request_error";

export type DraftPollingState = {
  draft: Draft | null;
  errorMessage: string | null;
  lastCheckedAt: Date | null;
  phase: DraftPollingPhase;
};
