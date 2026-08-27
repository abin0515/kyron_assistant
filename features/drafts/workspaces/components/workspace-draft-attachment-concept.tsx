"use client";

import {
  FileText,
  FolderOpen,
  Paperclip,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import { getSourceFileType } from "@/features/source-library/file-type";
import { createSampleSourceFiles } from "@/features/source-library/sample-data";
import type { SourceFileRecord } from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

type DialogView = "closed" | "picker" | "upload";

/**
 * Interactive design prototype only. Selection and uploads stay in memory and
 * never call application APIs, Blob storage, or Kyron.
 */
export function WorkspaceDraftAttachmentConcept({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<DialogView>("closed");
  const [files, setFiles] = useState<SourceFileRecord[]>(createSampleSourceFiles);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const attachment = files.find((file) => file.id === attachmentId);
  const attachmentFiles = files.filter(
    (file) => file.type === "pdf" || file.type === "pptx",
  );

  function openPicker() {
    setPendingId(attachmentId);
    setDialogView("picker");
  }

  function handleUpload(uploadedFiles: SourceFileListItem[]) {
    const addedFiles = uploadedFiles.map((file) => ({
      ...file,
      usages: [],
    }));

    setFiles((current) => [...addedFiles, ...current]);
    setPendingId(addedFiles[0]?.id ?? null);
    setDialogView("picker");
  }

  return (
    <section className="border-border grid gap-3 border-t pt-5 sm:col-span-2">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Draft attachment (optional)</p>
          <p className="text-muted-foreground max-w-xl text-xs">
            Choose one PDF or PPTX to send as source material with this draft.
          </p>
        </div>
        {!disabled ? (
          <Button
            className="w-fit"
            onClick={openPicker}
            type="button"
            variant="outline"
          >
            <FolderOpen aria-hidden="true" />
            Choose or upload
          </Button>
        ) : null}
      </div>

      {attachment ? (
        <div className="border-border flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
          <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
            <FileText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{attachment.name}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {attachment.type.toUpperCase()} · {formatFileSize(attachment.size)}
            </p>
          </div>
          <Badge className="hidden bg-white sm:inline-flex" variant="outline">
            Draft attachment
          </Badge>
          {!disabled ? (
            <Button
              aria-label={`Remove ${attachment.name} from this draft`}
              onClick={() => setAttachmentId(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="border-border bg-background flex items-center gap-3 rounded-xl border border-dashed px-4 py-4">
          <Paperclip
            aria-hidden="true"
            className="text-muted-foreground size-5 shrink-0"
          />
          <div>
            <p className="text-sm font-semibold">No attachment selected</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              The course draft can still be created without one.
            </p>
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Prototype behavior: the selected file would be sent when Create course
        draft is clicked.
      </p>

      {dialogView === "picker" ? (
        <DraftAttachmentPicker
          files={attachmentFiles}
          onApply={() => {
            setAttachmentId(pendingId);
            setDialogView("closed");
          }}
          onClose={() => setDialogView("closed")}
          onSelectedIdChange={setPendingId}
          onUpload={() => setDialogView("upload")}
          selectedId={pendingId}
        />
      ) : null}
      {dialogView === "upload" ? (
        <SourceUploadDialog
          allowedTypes={["pdf", "pptx"]}
          existingNames={files.map((file) => file.name)}
          onClose={() => setDialogView("picker")}
          onOpenExisting={(fileName) => {
            const normalizedName = fileName.toLocaleLowerCase();
            const existingFile = attachmentFiles.find(
              (file) => file.name.toLocaleLowerCase() === normalizedName,
            );

            setPendingId(existingFile?.id ?? null);
            setDialogView("picker");
          }}
          onUpload={handleUpload}
          open
          uploadFile={simulateFileUpload}
        />
      ) : null}
    </section>
  );
}

function DraftAttachmentPicker({
  files,
  onApply,
  onClose,
  onSelectedIdChange,
  onUpload,
  selectedId,
}: {
  files: SourceFileRecord[];
  onApply: () => void;
  onClose: () => void;
  onSelectedIdChange: (id: string | null) => void;
  onUpload: () => void;
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");
  const visibleFiles = useMemo(
    () => filterFiles(files, query),
    [files, query],
  );

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
        aria-labelledby="draft-attachment-picker-title"
        aria-modal="true"
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="draft-attachment-picker-title">
              Choose draft attachment
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Select one PDF or PPTX from your Source Library.
            </p>
          </div>
          <Button
            aria-label="Close draft attachment picker"
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
          <Button onClick={onUpload} size="sm" type="button" variant="outline">
            <Upload aria-hidden="true" />
            Upload new
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visibleFiles.length > 0 ? (
            <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
              {visibleFiles.map((file) => (
                <li key={file.id}>
                  <label className="hover:bg-muted/35 flex cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      checked={selectedId === file.id}
                      className="accent-primary size-4"
                      name="draft-attachment-concept"
                      onChange={() => onSelectedIdChange(file.id)}
                      type="radio"
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
                Try another search or upload a new PDF or PPTX.
              </p>
            </div>
          )}
        </div>

        <footer className="border-border flex flex-col-reverse justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center">
          <button
            className="text-muted-foreground hover:text-foreground w-fit text-xs font-medium"
            onClick={() => onSelectedIdChange(null)}
            type="button"
          >
            Clear selection
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={onApply} type="button">
              {selectedId ? "Use selected file" : "Continue without attachment"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function filterFiles(files: SourceFileRecord[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return normalizedQuery
    ? files.filter((file) =>
        file.name.toLocaleLowerCase().includes(normalizedQuery),
      )
    : files;
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

  if (!type || type === "docx") {
    throw new Error("Choose a PDF or PPTX file for this prototype.");
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
