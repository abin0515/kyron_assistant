"use client";

import {
  CircleCheck,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import {
  createSampleSourceFiles,
  getSourceFileType,
} from "@/features/source-library/sample-data";
import type { SourceFileRecord } from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

type DialogView = "closed" | "picker" | "upload";

/**
 * Interactive design prototype only. Selection and uploads stay in memory and
 * never call application APIs, Blob storage, extraction, or AI services.
 */
export function WorkspaceSourceSelectorConcept({
  deletionProtected = true,
  initialLinkedIds = ["source-cybersecurity-handbook"],
}: {
  deletionProtected?: boolean;
  initialLinkedIds?: string[];
}) {
  const [dialogView, setDialogView] = useState<DialogView>("closed");
  const [files, setFiles] = useState<SourceFileRecord[]>(createSampleSourceFiles);
  const [linkedIds, setLinkedIds] = useState<string[]>(initialLinkedIds);

  const linkedFiles = linkedIds.flatMap((id) => {
    const file = files.find((candidate) => candidate.id === id);
    return file ? [file] : [];
  });

  function handleUpload(uploadedFiles: SourceFileListItem[]) {
    const addedFiles = uploadedFiles.map((file) => ({
      ...file,
      usages: [],
    }));

    setFiles((current) => [...addedFiles, ...current]);
    setLinkedIds((current) => [
      ...current,
      ...addedFiles
        .map((file) => file.id)
        .filter((id) => !current.includes(id)),
    ]);
    setDialogView("picker");
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Source files</p>
          <p className="text-muted-foreground max-w-xl text-xs">
            Select one or more reusable files for AI course setup generation.
          </p>
        </div>
        <Button
          className="w-fit"
          onClick={() => setDialogView("picker")}
          type="button"
          variant="outline"
        >
          <FolderOpen aria-hidden="true" />
          Choose source files
        </Button>
      </div>

      {linkedFiles.length > 0 ? (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border bg-white">
          {linkedFiles.map((file) => (
            <li className="flex items-center gap-3 px-4 py-3" key={file.id}>
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {file.type.toUpperCase()} · {formatFileSize(file.size)}
                </p>
              </div>
              <Badge className="hidden bg-white sm:inline-flex" variant="outline">
                AI source
              </Badge>
              <Button
                aria-label={`Remove ${file.name} from this workspace`}
                onClick={() =>
                  setLinkedIds((current) =>
                    current.filter((id) => id !== file.id),
                  )
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border bg-background grid justify-items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
          <FilePlus2 aria-hidden="true" className="text-muted-foreground size-5" />
          <p className="text-sm font-semibold">No source files selected</p>
          <p className="text-muted-foreground text-xs">
            You can still generate from the brief or transcript above.
          </p>
        </div>
      )}

      {linkedFiles.length > 0 ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          {deletionProtected ? (
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
          ) : (
            <History aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          )}
          {deletionProtected
            ? "Linked files are protected from deletion while this workspace is active."
            : "These files were previously used. Deleting them will not affect the existing draft, but they cannot be reused here."}
        </p>
      ) : null}

      {dialogView === "picker" ? (
        <SourceFilePickerDialog
          files={files}
          linkedIds={linkedIds}
          onApply={setLinkedIds}
          onClose={() => setDialogView("closed")}
          onUpload={() => setDialogView("upload")}
          open
        />
      ) : null}
      {dialogView === "upload" ? (
        <SourceUploadDialog
          existingNames={files.map((file) => file.name)}
          onClose={() => setDialogView("picker")}
          onOpenExisting={() => setDialogView("picker")}
          onUpload={handleUpload}
          open
          uploadFile={simulateFileUpload}
        />
      ) : null}
    </section>
  );
}

function SourceFilePickerDialog({
  files,
  linkedIds,
  onApply,
  onClose,
  onUpload,
  open,
}: {
  files: SourceFileRecord[];
  linkedIds: string[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
  onUpload: () => void;
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(linkedIds);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return normalizedQuery
      ? files.filter((file) =>
          file.name.toLocaleLowerCase().includes(normalizedQuery),
        )
      : files;
  }, [files, query]);

  if (!open) {
    return null;
  }

  function handleClose() {
    setQuery("");
    setSelectedIds(linkedIds);
    onClose();
  }

  function handleApply() {
    onApply(selectedIds);
    setQuery("");
    onClose();
  }

  function toggleFile(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <section
        aria-labelledby="source-picker-title"
        aria-modal="true"
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="source-picker-title">
              Choose source files
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Select multiple files for AI analysis in this workspace.
            </p>
          </div>
          <Button
            aria-label="Close source file picker"
            onClick={handleClose}
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
          <Button onClick={onUpload} size="sm" type="button" variant="outline">
            <Upload aria-hidden="true" />
            Upload new
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visibleFiles.length > 0 ? (
            <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
              {visibleFiles.map((file) => {
                const selected = selectedIds.includes(file.id);

                return (
                  <li key={file.id}>
                    <label className="hover:bg-muted/35 flex cursor-pointer items-center gap-3 px-4 py-3">
                      <input
                        checked={selected}
                        className="accent-primary size-4"
                        onChange={() => toggleFile(file.id)}
                        type="checkbox"
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
                      {linkedIds.includes(file.id) ? (
                        <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
                          <CircleCheck aria-hidden="true" className="size-3.5" />
                          Linked
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
              <Search aria-hidden="true" className="text-muted-foreground size-5" />
              <p className="text-sm font-semibold">No matching files</p>
              <p className="text-muted-foreground text-xs">
                Try another search or upload a new source file.
              </p>
            </div>
          )}
        </div>

        <footer className="border-border flex flex-col-reverse justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center">
          <button
            className="text-muted-foreground hover:text-foreground w-fit text-xs font-medium"
            onClick={() => setSelectedIds([])}
            type="button"
          >
            Clear selection
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={handleClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={handleApply} type="button">
              Use {selectedIds.length} file{selectedIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

async function simulateFileUpload(
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
    }) => void;
  },
) {
  for (const percentage of [35, 70, 100]) {
    await waitForDemoProgress(options?.signal);
    options?.onProgress?.({
      loaded: Math.round((file.size * percentage) / 100),
      total: file.size,
      percentage,
    });
  }

  const type = getSourceFileType(file.name);

  if (!type) {
    throw new Error("Unsupported prototype file type.");
  }

  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type,
    workspaceCount: 0,
    uploadedAt: timestamp,
    updatedAt: timestamp,
  } satisfies SourceFileListItem;
}

function waitForDemoProgress(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 220);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Upload canceled.", "AbortError"));
      },
      { once: true },
    );
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
