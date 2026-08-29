"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listDraftsByIds,
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
import type { PaginationMeta } from "@/types/api";

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  perPage: 25,
  totalCount: 0,
  totalPages: 0,
};

export function useWorkspaceRecords() {
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [records, setRecords] = useState<DraftRecord[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialRecords() {
      try {
        const result = await loadRecordPages(controller.signal, "stored", 1);
        const storedRecords = result.records;

        if (controller.signal.aborted) {
          return;
        }

        setRecords(storedRecords);
        setPagination(result.pagination);

        const synchronized = await loadRecordPages(
          controller.signal,
          "sync-generating",
          1,
        );

        if (!controller.signal.aborted) {
          setRecords(synchronized.records);
          setPagination(synchronized.pagination);
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
      const result = await loadRecordPages(
        controller.signal,
        mode,
        pagination.page,
      );

      if (!controller.signal.aborted) {
        setRecords(result.records);
        setPagination(result.pagination);
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
  }, [pagination.page]);

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
    hasMore: pagination.page < pagination.totalPages,
    loading,
    loadingMore,
    records,
    removeRecord: (workspaceId: string) => {
      setRecords((current) =>
        current.filter((record) => record.workspace.id !== workspaceId),
      );
      setPagination((current) => {
        const totalCount = Math.max(0, current.totalCount - 1);

        return {
          ...current,
          totalCount,
          totalPages:
            totalCount === 0 ? 0 : Math.ceil(totalCount / current.perPage),
        };
      });
    },
    synchronizeAll: () => synchronizeRecords("sync-all"),
    totalCount: pagination.totalCount,
    loadMore: async () => {
      if (loadingMore || pagination.page >= pagination.totalPages) {
        return;
      }

      setLoadingMore(true);
      setErrorMessage(null);

      try {
        const result = await loadRecordPage(pagination.page + 1);
        setRecords((current) => mergeRecords(current, result.records));
        setPagination(result.pagination);
      } catch (error) {
        setErrorMessage(messageFromError(error));
      } finally {
        setLoadingMore(false);
      }
    },
  };
}

async function loadRecordPages(
  signal: AbortSignal,
  mode: DraftLoadMode,
  pageCount: number,
): Promise<{ records: DraftRecord[]; pagination: PaginationMeta }> {
  if (mode === "sync-all") {
    await syncDrafts(1, signal);
  } else if (mode === "sync-generating") {
    await syncGeneratingDrafts(1, signal);
  }

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) =>
      loadRecordPage(index + 1, signal),
    ),
  );

  return {
    records: pages.reduce<DraftRecord[]>(
      (records, page) => mergeRecords(records, page.records),
      [],
    ),
    pagination: pages.at(-1)?.pagination ?? EMPTY_PAGINATION,
  };
}

async function loadRecordPage(
  page: number,
  signal?: AbortSignal,
): Promise<{ records: DraftRecord[]; pagination: PaginationMeta }> {
  const workspaceResponse = await listDraftWorkspaces(page, signal);
  const draftIds = workspaceResponse.workspaces.flatMap((workspace) =>
    workspace.kyronDraftId ? [workspace.kyronDraftId] : [],
  );
  const draftResponse = await listDraftsByIds(draftIds, signal);
  const draftsById = new Map(
    draftResponse.drafts.map((draft) => [draft.id, draft]),
  );

  const records = workspaceResponse.workspaces.map((workspace) => {
    const draft = workspace.kyronDraftId
      ? (draftsById.get(workspace.kyronDraftId) ?? null)
      : null;

    return {
      draft,
      status: getStoredDraftDisplayStatus(workspace, draft),
      workspace,
    };
  });

  return { records, pagination: workspaceResponse.pagination };
}

function mergeRecords(current: DraftRecord[], incoming: DraftRecord[]) {
  const recordsById = new Map(
    current.map((record) => [record.workspace.id, record]),
  );

  for (const record of incoming) {
    recordsById.set(record.workspace.id, record);
  }

  return [...recordsById.values()];
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft records could not be loaded.";
}
