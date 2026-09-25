"use client";

import { FileText, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BatchSourceFileType,
} from "@/features/batches/types";
import { useSourceFilePages } from "@/features/source-library/use-source-file-pages";
import type { SourceFileListItem } from "@/types/api";

type BatchSourcePickerProps = {
  initialSelectedFiles: SourceFileListItem[];
  onApply: (files: SourceFileListItem[]) => void;
  onClose: () => void;
};

type FileTypeFilter = "all" | BatchSourceFileType;

export function BatchSourcePicker({
  initialSelectedFiles,
  onApply,
  onClose,
}: BatchSourcePickerProps) {
  const [selectedIds, setSelectedIds] = useState(
    initialSelectedFiles.map((file) => file.id),
  );
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>("all");
  const {
    errorMessage,
    files,
    hasMore,
    knownFiles,
    loadMore,
    loading,
    loadingMore,
    query,
    setQuery,
  } = useSourceFilePages({
    enabled: true,
    initialFiles: initialSelectedFiles,
    types: typeFilter === "all" ? [] : [typeFilter],
  });
  const selectedFilesById = useMemo(
    () =>
      new Map(
        [...initialSelectedFiles, ...knownFiles].map((file) => [file.id, file]),
      ),
    [initialSelectedFiles, knownFiles],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const visibleIds = files.map((file) => file.id);
  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="batch-source-picker-title"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/80 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-bold" id="batch-source-picker-title">
              Select source files
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each selected file will create one independently reviewable
              workspace.
            </p>
          </div>
          <Button
            aria-label="Close source file picker"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="grid gap-3 border-b border-border/80 bg-surface-subtle p-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-6">
          <label className="relative block">
            <span className="sr-only">Search source files</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Source Library"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="sr-only">Filter by file type</span>
            <select
              className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
              onChange={(event) =>
                setTypeFilter(event.target.value as FileTypeFilter)
              }
              value={typeFilter}
            >
              <option value="all">All file types</option>
              <option value="pdf">PDF</option>
              <option value="pptx">PPTX</option>
              <option value="docx">DOCX</option>
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin text-muted-foreground"
              />
              <p className="text-sm font-semibold">Loading source files</p>
            </div>
          ) : files.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {files.map((file) => (
                <li key={file.id}>
                  <label className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/45">
                    <input
                      checked={selectedIds.includes(file.id)}
                      className="size-4 accent-primary"
                      onChange={() => setSelectedIds(toggleId(selectedIds, file.id))}
                      type="checkbox"
                    />
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {file.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {file.type.toUpperCase()} · {formatFileSize(file.size)}
                      </span>
                    </span>
                    <Badge variant={file.type === "docx" ? "neutral" : "info"}>
                      {file.type === "docx" ? "AI only" : "Attachment eligible"}
                    </Badge>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
              <Search aria-hidden="true" className="size-5 text-muted-foreground" />
              <p className="text-sm font-semibold">No matching files</p>
              <p className="text-xs text-muted-foreground">
                Try another search or file type.
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

        {errorMessage ? (
          <p className="border-t border-border px-5 py-3 text-xs text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <footer className="flex flex-col-reverse justify-between gap-3 border-t border-border/80 bg-surface-subtle px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                checked={allVisibleSelected}
                className="size-4 accent-primary"
                disabled={visibleIds.length === 0}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? Array.from(new Set([...selectedIds, ...visibleIds]))
                      : selectedIds.filter((id) => !visibleIds.includes(id)),
                  )
                }
                type="checkbox"
              />
              Select visible
            </label>
            <button
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() =>
                onApply(
                  selectedIds.flatMap((id) => {
                    const file = selectedFilesById.get(id);
                    return file ? [file] : [];
                  }),
                )
              }
              type="button"
            >
              Use {selectedIds.length} file{selectedIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id)
    ? ids.filter((selectedId) => selectedId !== id)
    : [...ids, id];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
