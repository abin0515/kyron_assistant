"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getDraft,
  getPollingDelay,
  MAX_CONSECUTIVE_POLLING_FAILURES,
  POLLING_INTERVAL_MS,
} from "@/features/drafts/kyron-drafts/api";
import type {
  DraftPollingPhase,
  DraftPollingState,
} from "@/features/drafts/kyron-drafts/types";
import { DraftApiError } from "@/features/drafts/shared/api-response";
import type { Draft } from "@/types/api";

const INITIAL_STATE: DraftPollingState = {
  draft: null,
  errorMessage: null,
  lastCheckedAt: null,
  phase: "idle",
};

export function useDraftPolling(draftId: number | null) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<DraftPollingState>(INITIAL_STATE);

  const checkNow = useCallback(() => {
    if (draftId) {
      setRefreshKey((current) => current + 1);
    }
  }, [draftId]);

  useEffect(() => {
    if (!draftId) {
      return;
    }

    let disposed = false;
    let consecutiveFailures = 0;
    let timer: number | undefined;
    let requestController: AbortController | null = null;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          void poll();
        }
      }, delay);
    };

    const poll = async () => {
      if (disposed || requestController) {
        return;
      }

      requestController = new AbortController();
      setState((current) => ({
        ...current,
        errorMessage: null,
        phase: current.draft ? current.phase : "checking",
      }));

      try {
        const draft = await getDraft(draftId, requestController.signal);

        if (disposed) {
          return;
        }

        consecutiveFailures = 0;
        const nextState = stateFromDraft(draft);
        setState({
          draft,
          errorMessage: null,
          lastCheckedAt: new Date(),
          phase: nextState,
        });

        if (nextState === "generating") {
          schedule(POLLING_INTERVAL_MS);
        }
      } catch (error) {
        if (disposed || requestController.signal.aborted) {
          return;
        }

        const nextError = pollingError(error);
        consecutiveFailures += 1;

        if (
          nextError.phase === "request_error" &&
          nextError.retryable &&
          consecutiveFailures < MAX_CONSECUTIVE_POLLING_FAILURES
        ) {
          const delay = getPollingDelay(consecutiveFailures);
          setState((current) => ({
            ...current,
            errorMessage: `Temporary connection issue. Trying again in about ${Math.round(delay / 1_000)} seconds.`,
            lastCheckedAt: new Date(),
            phase: "generating",
          }));
          schedule(delay);
        } else {
          setState((current) => ({
            ...current,
            errorMessage: nextError.message,
            lastCheckedAt: new Date(),
            phase: nextError.phase,
          }));
        }
      } finally {
        requestController = null;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && !requestController) {
        window.clearTimeout(timer);
        void poll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      requestController?.abort();
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [draftId, refreshKey]);

  return { checkNow, state: draftId ? state : INITIAL_STATE };
}

function stateFromDraft(
  draft: Draft,
): DraftPollingPhase {
  if (draft.status === "done") {
    return "complete";
  }

  if (draft.status === "error") {
    return "generation_error";
  }

  return "generating";
}

function pollingError(error: unknown): {
  message: string;
  phase: "unavailable" | "request_error";
  retryable: boolean;
} {
  if (
    error instanceof DraftApiError &&
    error.code === "KYRON_NOT_FOUND"
  ) {
    return {
      message: error.message,
      phase: "unavailable",
      retryable: false,
    };
  }

  return {
    message:
      error instanceof Error
        ? error.message
        : "The latest generation status could not be loaded.",
    phase: "request_error",
    retryable:
      error instanceof DraftApiError ? error.retryable : true,
  };
}
