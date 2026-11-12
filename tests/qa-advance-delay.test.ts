import { describe, expect, it } from "vitest";

import { advanceDelayMs } from "@/features/qa/advance-delay";

describe("how long an open page waits before advancing a run again", () => {
  it("waits the usual 1.5 s when the run is not waiting on anything", () => {
    for (const nextStepInMs of [null, 0, -5_000, 400, Number.NaN]) {
      expect(advanceDelayMs({ nextStepInMs })).toBe(1_500);
    }
  });

  it("waits until just after the run's next check is due", () => {
    expect(advanceDelayMs({ nextStepInMs: 29_800 })).toBe(30_300);
    expect(advanceDelayMs({ nextStepInMs: 1_200 })).toBe(1_700);
  });

  it("checks back at least once a minute", () => {
    expect(advanceDelayMs({ nextStepInMs: 300_000 })).toBe(60_000);
    expect(advanceDelayMs({ nextStepInMs: Number.POSITIVE_INFINITY })).toBe(1_500);
  });
});
