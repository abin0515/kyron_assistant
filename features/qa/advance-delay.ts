import type { QaRunDetailResponse } from "@/types/api";

// The pause between an open page's advance calls while a run has work left.
const STEP_DELAY_MS = 1_500;
// Asked a little after the next step is due, so the server's wait is over.
const DUE_MARGIN_MS = 500;
// An open page checks back at least once a minute.
const MAX_DELAY_MS = 60_000;

// While the run waits on outside work (a render check runs every 30 s), the
// page waits until its next step is due instead of asking every 1.5 s.
export function advanceDelayMs(detail: Pick<QaRunDetailResponse, "nextStepInMs">): number {
  const waitMs = detail.nextStepInMs;

  if (typeof waitMs !== "number" || !Number.isFinite(waitMs)) {
    return STEP_DELAY_MS;
  }

  return Math.max(STEP_DELAY_MS, Math.min(waitMs + DUE_MARGIN_MS, MAX_DELAY_MS));
}
