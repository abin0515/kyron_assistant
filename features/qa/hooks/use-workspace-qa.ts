"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { advanceQaRun, getWorkspaceQa } from "@/features/qa/api";
import { messageFromError } from "@/features/qa/labels";
import type { QaRunDetailResponse, QaWorkspaceQaResponse } from "@/types/api";

const STEP_DELAY_MS = 1_500;
const RETRY_DELAY_MS = 8_000;

export type WorkspaceQaState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; qa: QaWorkspaceQaResponse; advanceError: string | null };

// Loads a workspace's setup and lesson checks and keeps advancing whichever is
// still running while the workspace page is open.
export function useWorkspaceQa(
  workspaceId: string,
  { onSetupSettled, refreshKey }: { onSetupSettled: () => void; refreshKey: number },
) {
  const [state, setState] = useState<WorkspaceQaState>({ status: "loading" });
  const [cycle, setCycle] = useState(0);
  const onSetupSettledRef = useRef(onSetupSettled);

  useEffect(() => {
    onSetupSettledRef.current = onSetupSettled;
  }, [onSetupSettled]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function advanceActiveRuns(initial: QaWorkspaceQaResponse) {
      let qa = initial;

      for (let active = nextActiveRun(qa); active && !signal.aborted; active = nextActiveRun(qa)) {
        try {
          const detail = await advanceQaRun(active.run.id, signal);
          const setupSettled =
            active.run.target === "course_setup" && detail.pendingStepCount === 0;

          qa = active.run.target === "course_setup" ? { ...qa, setup: detail } : { ...qa, lesson: detail };
          setState({ status: "ready", qa, advanceError: null });

          if (setupSettled) {
            onSetupSettledRef.current();
          }

          await wait(STEP_DELAY_MS, signal);
        } catch (error) {
          if (signal.aborted) {
            return;
          }

          setState({ status: "ready", qa, advanceError: messageFromError(error, "The quality check could not advance.") });
          await wait(RETRY_DELAY_MS, signal);
        }
      }
    }

    async function load() {
      try {
        const qa = await getWorkspaceQa(workspaceId, signal);

        setState({ status: "ready", qa, advanceError: null });
        await advanceActiveRuns(qa);
      } catch (error) {
        if (!signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Quality checks could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [workspaceId, cycle, refreshKey]);

  const applyQa = useCallback((qa: QaWorkspaceQaResponse) => {
    setState({ status: "ready", qa, advanceError: null });
    setCycle((current) => current + 1);
  }, []);

  return { state, applyQa };
}

function nextActiveRun(qa: QaWorkspaceQaResponse): QaRunDetailResponse | null {
  if (qa.setup && qa.setup.pendingStepCount > 0) {
    return qa.setup;
  }

  return qa.lesson && qa.lesson.pendingStepCount > 0 ? qa.lesson : null;
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
