"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listDrafts,
  POLLING_INTERVAL_MS,
  syncDrafts,
  syncGeneratingDrafts,
} from "@/features/drafts/kyron-drafts/api";
import { getStoredDraftDisplayStatus } from "@/features/drafts/shared/status";
import { listDraftWorkspaces } from "@/features/drafts/workspaces/api";
import type {
  DraftLoadMode,
  DraftRecord,
} from "@/features/drafts/workspaces/types";

export function useWorkspaceRecords() {
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DraftRecord[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialRecords() {
      try {
        const storedRecords = await loadRecords(controller.signal, "stored");

        if (controller.signal.aborted) {
          return;
        }

        setRecords(storedRecords);

        if (hasGeneratingRecords(storedRecords)) {
          const synchronizedRecords = await loadRecords(
            controller.signal,
            "sync-generating",
          );

          if (!controller.signal.aborted) {
            setRecords(synchronizedRecords);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(messageFromError(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInitialRecords();

    return () => controller.abort();
  }, []);

  const synchronizeRecords = useCallback(async (mode: DraftLoadMode) => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setErrorMessage(null);
    setLoading(true);

    try {
      const nextRecords = await loadRecords(controller.signal, mode);

      if (!controller.signal.aborted) {
        setRecords(nextRecords);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      if (refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const hasGeneratingDrafts = records.some(
    (record) => record.status === "generating",
  );

  useEffect(() => {
    if (loading || !hasGeneratingDrafts) {
      return;
    }

    const timer = window.setTimeout(() => {
      void synchronizeRecords("sync-generating");
    }, POLLING_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [hasGeneratingDrafts, loading, synchronizeRecords]);

  useEffect(
    () => () => {
      refreshControllerRef.current?.abort();
    },
    [],
  );

  return {
    errorMessage,
    loading,
    records,
    removeRecord: (workspaceId: string) => {
      setRecords((current) =>
        current.filter((record) => record.workspace.id !== workspaceId),
      );
    },
    synchronizeAll: () => synchronizeRecords("sync-all"),
  };
}

async function loadRecords(
  signal: AbortSignal,
  mode: DraftLoadMode,
): Promise<DraftRecord[]> {
  const [workspaceResponse, draftResponse] = await Promise.all([
    listDraftWorkspaces(signal),
    loadDrafts(mode, signal),
  ]);
  const draftsById = new Map(
    draftResponse.drafts.map((draft) => [draft.id, draft]),
  );

  return workspaceResponse.workspaces.map((workspace) => {
    const draft = workspace.kyronDraftId
      ? (draftsById.get(workspace.kyronDraftId) ?? null)
      : null;

    return {
      draft,
      status: getStoredDraftDisplayStatus(workspace, draft),
      workspace,
    };
  });
}

function loadDrafts(mode: DraftLoadMode, signal: AbortSignal) {
  if (mode === "sync-all") {
    return syncDrafts(signal);
  }

  if (mode === "sync-generating") {
    return syncGeneratingDrafts(signal);
  }

  return listDrafts(signal);
}

function hasGeneratingRecords(records: DraftRecord[]): boolean {
  return records.some((record) => record.status === "generating");
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft records could not be loaded.";
}
