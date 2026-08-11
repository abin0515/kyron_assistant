"use client";

import { useEffect, useRef, useState } from "react";

import { generateCourseSetup } from "@/features/drafts/workspaces/api";
import type { CourseSetup } from "@/types/api";

export type CourseSetupGeneratorState = {
  errorMessage: string | null;
  phase: "idle" | "generating" | "generated" | "error";
};

export function useCourseSetupGenerator() {
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<CourseSetupGeneratorState>({
    errorMessage: null,
    phase: "idle",
  });

  async function generate(brief: string): Promise<CourseSetup | null> {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ errorMessage: null, phase: "generating" });

    try {
      const setup = await generateCourseSetup(brief, controller.signal);

      if (!controller.signal.aborted) {
        setState({ errorMessage: null, phase: "generated" });
        return setup;
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          errorMessage:
            error instanceof Error
              ? error.message
              : "The course setup could not be generated.",
          phase: "error",
        });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }

    return null;
  }

  function reset() {
    setState({ errorMessage: null, phase: "idle" });
  }

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { generate, reset, state };
}
