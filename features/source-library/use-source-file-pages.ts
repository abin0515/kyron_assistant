"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listSourceFiles } from "@/features/source-library/api";
import type {
  PaginationMeta,
  SourceFileListItem,
  SourceFileType,
} from "@/types/api";

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  perPage: 25,
  totalCount: 0,
  totalPages: 0,
};

export function useSourceFilePages({
  enabled,
  initialFiles = [],
  initialQuery = "",
  types = [],
}: {
  enabled: boolean;
  initialFiles?: SourceFileListItem[];
  initialQuery?: string;
  types?: SourceFileType[];
}) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState(initialFiles);
  const [knownFiles, setKnownFiles] = useState(initialFiles);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [query, setQuery] = useState(initialQuery);
  const typesKey = types.join(",");
  const requestedTypes = useMemo(
    () => (typesKey ? (typesKey.split(",") as SourceFileType[]) : []),
    [typesKey],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLoading(true);
      setErrorMessage(null);
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;

      void listSourceFiles(
        { page: 1, query, types: requestedTypes },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setFiles(response.files);
          setKnownFiles((current) => mergeFiles(current, response.files));
          setPagination(response.pagination);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setErrorMessage(messageFromError(error));
          }
        })
        .finally(() => {
          if (requestControllerRef.current === controller) {
            requestControllerRef.current = null;
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      requestControllerRef.current?.abort();
    };
  }, [enabled, query, requestedTypes]);

  const loadMore = useCallback(async () => {
    if (
      loading ||
      loadingMore ||
      pagination.page >= pagination.totalPages
    ) {
      return;
    }

    setLoadingMore(true);
    setErrorMessage(null);

    try {
      const response = await listSourceFiles({
        page: pagination.page + 1,
        query,
        types: requestedTypes,
      });

      setFiles((current) => mergeFiles(current, response.files));
      setKnownFiles((current) => mergeFiles(current, response.files));
      setPagination(response.pagination);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, pagination, query, requestedTypes]);

  const addKnownFiles = useCallback((newFiles: SourceFileListItem[]) => {
    setKnownFiles((current) => mergeFiles(newFiles, current));
    setFiles((current) => mergeFiles(newFiles, current));
  }, []);

  return {
    addKnownFiles,
    errorMessage,
    files,
    hasMore: pagination.page < pagination.totalPages,
    knownFiles,
    loadMore,
    loading,
    loadingMore,
    query,
    setQuery,
  };
}

function mergeFiles(
  first: SourceFileListItem[],
  second: SourceFileListItem[],
): SourceFileListItem[] {
  const merged = new Map<string, SourceFileListItem>();

  for (const file of [...first, ...second]) {
    if (!merged.has(file.id)) {
      merged.set(file.id, file);
    }
  }

  return Array.from(merged.values());
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Source files could not be loaded.";
}
