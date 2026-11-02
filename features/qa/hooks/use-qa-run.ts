"use client";

import { useCallback, useEffect, useState } from "react";

import { advanceQaRun, getQaRun } from "@/features/qa/api";
import { messageFromError } from "@/features/qa/labels";
import type { QaRunDetailResponse } from "@/types/api";

const STEP_DELAY_MS = 1_500;
const RETRY_DELAY_MS = 8_000;

export type QaRunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: QaRunDetailResponse; advanceError: string | null };

// Loads the run, then keeps advancing it one step at a time while it has
// pending work and the page stays open.
export function useQaRun(runId: string) {
  const [state, setState] = useState<QaRunState>({ status: "loading" });
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function advanceWhilePending(initial: QaRunDetailResponse) {
      let detail = initial;

      while (detail.pendingStepCount > 0 && !signal.aborted) {
        try {
          detail = await advanceQaRun(runId, signal);
          setState({ status: "ready", detail, advanceError: null });
          await wait(STEP_DELAY_MS, signal);
        } catch (error) {
          if (signal.aborted) {
            return;
          }

          setState({
            status: "ready",
            detail,
            advanceError: messageFromError(error, "The run could not advance."),
          });
          await wait(RETRY_DELAY_MS, signal);
        }
      }
    }

    async function load() {
      try {
        const detail = await getQaRun(runId, signal);

        setState({ status: "ready", detail, advanceError: null });
        await advanceWhilePending(detail);
      } catch (error) {
        if (!signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "The run could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [runId, cycle]);

  const applyDetail = useCallback((detail: QaRunDetailResponse) => {
    setState({ status: "ready", detail, advanceError: null });

    if (detail.pendingStepCount > 0) {
      setCycle((current) => current + 1);
    }
  }, []);

  return { state, applyDetail };
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);

    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
