"use client";

import { FileText, LoaderCircle, Search, Upload, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSourceFilePages } from "@/features/source-library/use-source-file-pages";
import type { SourceFileListItem, SourceFileType } from "@/types/api";

export function WorkspaceSourceFilePicker({
  busy,
  emptyDescription = "Try another search or upload a new source file.",
  errorMessage,
  initialFiles = [],
  onApply,
  onClose,
  onFilesChange,
  onSelectedIdsChange,
  onUpload,
  selectionMode = "multiple",
  selectedIds,
  types = [],
}: {
  busy: boolean;
  emptyDescription?: string;
  errorMessage: string | null;
  initialFiles?: SourceFileListItem[];
  onApply: () => void;
  onClose: () => void;
  onFilesChange?: (files: SourceFileListItem[]) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onUpload: () => void;
  selectionMode?: "multiple" | "single";
  selectedIds: string[];
  types?: SourceFileType[];
}) {
  const {
    errorMessage: loadErrorMessage,
    files,
    hasMore,
    knownFiles,
    loadMore,
    loading,
    loadingMore,
    query,
    setQuery,
  } = useSourceFilePages({ enabled: true, initialFiles, types });
  const applyLabel = getApplyLabel(
    loading,
    busy,
    selectionMode,
    selectedIds.length,
  );

  useEffect(() => {
    onFilesChange?.(knownFiles);
  }, [knownFiles, onFilesChange]);

  function toggleFile(id: string) {
    if (selectionMode === "single") {
      onSelectedIdsChange(selectedIds.includes(id) ? [] : [id]);
      return;
    }

    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="workspace-source-picker-title"
        aria-modal="true"
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="workspace-source-picker-title">
              Choose source files
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {selectionMode === "single"
                ? "Select one file from your Source Library."
                : "Select one or more files from your Source Library."}
            </p>
          </div>
          <Button
            aria-label="Close source file picker"
            disabled={busy}
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="border-border grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Search source files</span>
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              className="h-9 bg-white pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Source Library"
              type="search"
              value={query}
            />
          </label>
          <Button
            disabled={busy || loading}
            onClick={onUpload}
            size="sm"
            type="button"
            variant="outline"
          >
            <Upload aria-hidden="true" />
            Upload new
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
              <LoaderCircle
                aria-hidden="true"
                className="text-muted-foreground size-5 animate-spin"
              />
              <p className="text-sm font-semibold">Loading source files</p>
            </div>
          ) : files.length > 0 ? (
            <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
              {files.map((file) => (
                <li key={file.id}>
                  <label className="hover:bg-muted/35 flex cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      checked={selectedIds.includes(file.id)}
                      className="accent-primary size-4"
                      disabled={busy}
                      name={
                        selectionMode === "single"
                          ? "workspace-source-file"
                          : undefined
                      }
                      onChange={() => toggleFile(file.id)}
                      type={selectionMode === "single" ? "radio" : "checkbox"}
                    />
                    <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {file.name}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {file.type.toUpperCase()} · {formatFileSize(file.size)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
              <Search aria-hidden="true" className="text-muted-foreground size-5" />
              <p className="text-sm font-semibold">No matching files</p>
              <p className="text-muted-foreground text-xs">
                {emptyDescription}
              </p>
            </div>
          )}
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button
                disabled={loadingMore}
                onClick={() => void loadMore()}
                size="sm"
                type="button"
                variant="outline"
              >
                {loadingMore ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : null}
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>

        {errorMessage || loadErrorMessage ? (
          <p className="text-destructive border-border border-t px-5 py-3 text-xs" role="alert">
            {errorMessage ?? loadErrorMessage}
          </p>
        ) : null}

        <footer className="border-border flex flex-col-reverse justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center">
          <button
            className="text-muted-foreground hover:text-foreground w-fit text-xs font-medium"
            disabled={busy || loading}
            onClick={() => onSelectedIdsChange([])}
            type="button"
          >
            Clear selection
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              disabled={busy}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || loading}
              onClick={onApply}
              type="button"
            >
              {applyLabel}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function getApplyLabel(
  loading: boolean,
  busy: boolean,
  selectionMode: "multiple" | "single",
  selectedCount: number,
): string {
  if (loading) {
    return "Loading...";
  }

  if (busy) {
    return "Saving...";
  }

  if (selectionMode === "single") {
    return selectedCount === 1
      ? "Use selected file"
      : "Continue without attachment";
  }

  return `Use ${selectedCount} file${selectedCount === 1 ? "" : "s"}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
