"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { updateDraftWorkspace } from "@/features/drafts/workspaces/api";
import type {
  DraftWorkspace,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

const AUTOSAVE_DELAY_MS = 800;

export type WorkspaceAutosaveState = {
  errorMessage: string | null;
  phase: "idle" | "pending" | "saving" | "saved" | "error";
  savedAt: Date | null;
};

const INITIAL_STATE: WorkspaceAutosaveState = {
  errorMessage: null,
  phase: "idle",
  savedAt: null,
};

export function useWorkspaceAutosave(
  onSaved: (workspace: DraftWorkspace) => void,
) {
  const controllerRef = useRef<AbortController | null>(null);
  const pendingWorkspaceRef = useRef<DraftWorkspace | null>(null);
  const revisionRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const [state, setState] = useState(INITIAL_STATE);

  const saveWorkspace = useCallback(
    async (
      workspace: DraftWorkspace,
      revision: number,
    ): Promise<DraftWorkspace> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ errorMessage: null, phase: "saving", savedAt: null });

      try {
        const savedWorkspace = await updateDraftWorkspace(
          workspace.id,
          toUpdateRequest(workspace),
          controller.signal,
        );

        if (!controller.signal.aborted && revision === revisionRef.current) {
          pendingWorkspaceRef.current = null;
          onSaved(savedWorkspace);
          setState({
            errorMessage: null,
            phase: "saved",
            savedAt: new Date(),
          });
        }

        return savedWorkspace;
      } catch (error) {
        if (!controller.signal.aborted && revision === revisionRef.current) {
          setState({
            errorMessage: messageFromError(error),
            phase: "error",
            savedAt: null,
          });
        }

        throw error;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [onSaved],
  );

  const queueSave = useCallback(
    (workspace: DraftWorkspace) => {
      window.clearTimeout(timerRef.current);
      controllerRef.current?.abort();

      const revision = revisionRef.current + 1;
      revisionRef.current = revision;
      pendingWorkspaceRef.current = workspace;
      setState({ errorMessage: null, phase: "pending", savedAt: null });

      timerRef.current = window.setTimeout(() => {
        void saveWorkspace(workspace, revision).catch(() => undefined);
      }, AUTOSAVE_DELAY_MS);
    },
    [saveWorkspace],
  );

  const saveNow = useCallback(
    async (workspace: DraftWorkspace): Promise<DraftWorkspace> => {
      window.clearTimeout(timerRef.current);
      controllerRef.current?.abort();

      const revision = revisionRef.current + 1;
      revisionRef.current = revision;
      pendingWorkspaceRef.current = workspace;

      return saveWorkspace(workspace, revision);
    },
    [saveWorkspace],
  );

  const retrySave = useCallback(() => {
    if (pendingWorkspaceRef.current) {
      queueSave(pendingWorkspaceRef.current);
    }
  }, [queueSave]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    },
    [],
  );

  return {
    queueSave,
    retrySave,
    saveNow,
    state,
  };
}

function toUpdateRequest(
  workspace: DraftWorkspace,
): UpdateDraftWorkspaceRequest {
  return {
    sourceText: workspace.sourceText,
    name: workspace.name,
    description: workspace.description,
    learningObjective: workspace.learningObjective,
    audience: workspace.audience,
    assetType: workspace.assetType,
    duration: workspace.duration,
  };
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft workspace could not be saved.";
}
