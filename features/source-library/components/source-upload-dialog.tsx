"use client";

import {
  CircleAlert,
  CircleCheck,
  FilePlus2,
  FileText,
  FolderOpen,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { uploadSourceFile } from "@/features/source-library/api";
import { getSourceFileType } from "@/features/source-library/file-type";
import {
  selectFolderFiles,
  type FolderSelection,
} from "@/features/source-library/folder-selection";
import type {
  SourceFileType,
  SourceFileUploadAction,
} from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

const MAX_FILE_SIZE = 250 * 1_048_576;
const MAX_CONCURRENT_UPLOADS = 3;
const DEFAULT_ALLOWED_TYPES: SourceFileType[] = ["pdf", "pptx", "docx"];

type SourceUploadDialogProps = {
  allowFolderSelection?: boolean;
  allowedTypes?: SourceFileType[];
  existingNames: string[];
  open: boolean;
  onClose: () => void;
  onOpenExisting: (fileName: string) => void;
  onUpload: (files: SourceFileListItem[]) => void;
  uploadFile?: SourceFileUploadAction;
};

type QueuedFile = {
  file: File;
  id: string;
  progress: number;
  relativePath: string | null;
  status: "ready" | "uploading" | "uploaded" | "failed";
  type: SourceFileType | null;
  uploadError: string | null;
};

export function SourceUploadDialog({
  allowFolderSelection = false,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  existingNames,
  open,
  onClose,
  onOpenExisting,
  onUpload,
  uploadFile = uploadSourceFile,
}: SourceUploadDialogProps) {
  const uploadControllerRef = useRef<AbortController | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [folderSelection, setFolderSelection] =
    useState<FolderSelection | null>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  useEffect(() => {
    if (open) {
      folderInputRef.current?.setAttribute("webkitdirectory", "");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  if (!open) {
    return null;
  }

  const uploading = queue.some((item) => item.status === "uploading");
  const validationErrors = getQueueValidationErrors(
    queue,
    existingNames,
    allowedTypes,
  );
  const blockedByValidation =
    allowFolderSelection && validationErrors.size > 0;
  const uploadableFiles = queue.filter(
    (item) =>
      !validationErrors.has(item.id) && item.status !== "uploaded",
  );
  const allowedTypeLabel = formatAllowedTypes(allowedTypes);

  function handleFiles(
    files: Array<{ file: File; relativePath: string | null }>,
  ) {
    setQueue((current) => {
      const additions = files.map(({ file, relativePath }, index) => ({
        file,
        type: getSourceFileType(file.name),
        id: `${file.name}-${file.lastModified}-${index}-${Date.now()}`,
        progress: 0,
        relativePath,
        status: "ready" as const,
        uploadError: null,
      }));

      return [...current, ...additions];
    });
  }

  function handleRegularFiles(files: File[]) {
    handleFiles(files.map((file) => ({ file, relativePath: null })));
  }

  function handleFolderFiles(files: File[]) {
    const selection = selectFolderFiles(files, allowedTypes);

    setFolderSelection(selection);
    handleFiles(selection.files);
  }

  function handleClose() {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setQueue([]);
    setDragActive(false);
    setFolderSelection(null);
    onClose();
  }

  async function handleUpload() {
    if (uploadableFiles.length === 0 || uploading || blockedByValidation) {
      return;
    }

    const controller = new AbortController();
    uploadControllerRef.current = controller;

    setQueue((current) =>
      current.map((item) =>
        uploadableFiles.some((upload) => upload.id === item.id)
          ? { ...item, uploadError: null, progress: 0, status: "uploading" }
          : item,
      ),
    );

    const uploadedFiles = await uploadQueuedFiles(uploadableFiles, controller);

    if (controller.signal.aborted) {
      return;
    }

    uploadControllerRef.current = null;
    if (uploadedFiles.length > 0) {
      onUpload(uploadedFiles);
    }
  }

  async function uploadQueuedFiles(
    files: QueuedFile[],
    controller: AbortController,
  ) {
    const uploadedFiles: Array<SourceFileListItem | null> = Array.from(
      { length: files.length },
      () => null,
    );
    let nextIndex = 0;

    async function uploadNext() {
      while (nextIndex < files.length && !controller.signal.aborted) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        try {
          uploadedFiles[currentIndex] = await uploadQueuedFile(
            files[currentIndex],
            controller,
          );
        } catch {
          // uploadQueuedFile stores the individual error in the queue.
        }
      }
    }

    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, files.length);
    await Promise.all(Array.from({ length: workerCount }, uploadNext));

    return uploadedFiles.filter(
      (file): file is SourceFileListItem => Boolean(file),
    );
  }

  async function uploadQueuedFile(item: QueuedFile, controller: AbortController) {
    try {
      const sourceFile = await uploadFile(item.file, {
        signal: controller.signal,
        onProgress: ({ percentage }) => {
          if (!controller.signal.aborted) {
            updateQueuedFile(item.id, {
              progress: Math.round(percentage),
            });
          }
        },
      });

      updateQueuedFile(item.id, {
        progress: 100,
        status: "uploaded",
      });

      return sourceFile;
    } catch (error) {
      if (!controller.signal.aborted) {
        updateQueuedFile(item.id, {
          progress: 0,
          status: "failed",
          uploadError: getUploadErrorMessage(error),
        });
      }

      throw error;
    }
  }

  function updateQueuedFile(id: string, update: Partial<QueuedFile>) {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
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
        aria-labelledby="source-upload-title"
        aria-modal="true"
        className="bg-card max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="source-upload-title">
              Upload source files
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Upload several files and follow each file independently.
            </p>
          </div>
          <Button
            aria-label="Close upload dialog"
            onClick={handleClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="grid gap-5 p-5">
          <div
            className={`grid min-h-44 place-items-center rounded-xl border border-dashed p-6 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border bg-background"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleRegularFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <div>
              <span className="bg-muted mx-auto grid size-10 place-items-center rounded-lg">
                <Upload aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-3 text-sm font-bold">
                Drop {allowedTypeLabel} files here
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Up to 250 MB each. File names must be unique.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  <FilePlus2 aria-hidden="true" />
                  Choose files
                </Button>
                {allowFolderSelection ? (
                  <Button
                    disabled={uploading}
                    onClick={() => folderInputRef.current?.click()}
                    type="button"
                    variant="outline"
                  >
                    <FolderOpen aria-hidden="true" />
                    Choose folder
                  </Button>
                ) : null}
              </div>
              <input
                accept={allowedTypes.map((type) => `.${type}`).join(",")}
                className="sr-only"
                disabled={uploading}
                multiple
                onChange={(event) => {
                  handleRegularFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                ref={inputRef}
                type="file"
              />
              {allowFolderSelection ? (
                <input
                  accept={allowedTypes.map((type) => `.${type}`).join(",")}
                  className="sr-only"
                  disabled={uploading}
                  multiple
                  onChange={(event) => {
                    handleFolderFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                  ref={folderInputRef}
                  type="file"
                />
              ) : null}
            </div>
          </div>

          {folderSelection ? (
            <FolderSelectionSummary selection={folderSelection} />
          ) : null}

          {queue.length > 0 ? (
            <div className="border-border overflow-hidden rounded-xl border">
              <div className="border-border bg-muted/35 flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-bold">Upload queue</p>
                <button
                  className="text-muted-foreground hover:text-foreground text-xs font-medium"
                  disabled={uploading}
                  onClick={() => {
                    setFolderSelection(null);
                    setQueue([]);
                  }}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <ul className="divide-border divide-y">
                {queue.map((item) => {
                  const error =
                    validationErrors.get(item.id) ?? item.uploadError;

                  return (
                    <li
                      className="flex items-start gap-3 px-4 py-3"
                      key={item.id}
                    >
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.file.name}
                        </p>
                        {item.relativePath ? (
                          <p
                            className="text-muted-foreground mt-0.5 truncate text-xs"
                            title={item.relativePath}
                          >
                            {item.relativePath}
                          </p>
                        ) : null}
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {formatFileSize(item.file.size)}
                        </p>
                        {error ? (
                          <div className="text-primary mt-2 flex items-start gap-1.5 text-xs">
                            <CircleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-3.5 shrink-0"
                            />
                            <span>{error}</span>
                          </div>
                        ) : null}
                        {item.status === "uploading" ? (
                          <UploadProgress percentage={item.progress} />
                        ) : null}
                        {item.status === "uploaded" ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CircleCheck
                              aria-hidden="true"
                              className="size-3.5"
                            />
                            Uploaded
                          </p>
                        ) : null}
                        {isExistingName(item.file.name, existingNames) ? (
                          <button
                            className="text-primary mt-2 text-xs font-semibold underline-offset-4 hover:underline"
                            onClick={() => {
                              handleClose();
                              onOpenExisting(item.file.name);
                            }}
                            type="button"
                          >
                            View existing file
                          </button>
                        ) : null}
                      </div>
                      <Button
                        aria-label={`Remove ${item.file.name} from queue`}
                        disabled={uploading || item.status === "uploaded"}
                        onClick={() =>
                          setQueue((current) =>
                            current.filter((queued) => queued.id !== item.id),
                          )
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="border-border flex flex-col-reverse justify-end gap-2 border-t px-5 py-4 sm:flex-row">
          <Button onClick={handleClose} type="button" variant="outline">
            {uploading ? "Cancel upload" : "Close"}
          </Button>
          <Button
            disabled={
              uploadableFiles.length === 0 || uploading || blockedByValidation
            }
            onClick={handleUpload}
            type="button"
          >
            {uploading ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {uploading
              ? "Uploading..."
              : blockedByValidation
                ? "Resolve errors to upload"
                : `Upload ${uploadableFiles.length || ""} file${
                    uploadableFiles.length === 1 ? "" : "s"
                  }`}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function FolderSelectionSummary({
  selection,
}: {
  selection: FolderSelection;
}) {
  const supportedCount = selection.files.length;
  const ignoredCount = selection.ignoredFiles.length;

  return (
    <section
      aria-live="polite"
      className="border-border bg-muted/25 rounded-xl border px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <FolderOpen
          aria-hidden="true"
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {selection.folderName}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {supportedCount} supported file{supportedCount === 1 ? "" : "s"}
            {ignoredCount > 0
              ? ` · ${ignoredCount} ignored file${ignoredCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </div>

      {ignoredCount > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="text-muted-foreground cursor-pointer font-medium">
            View ignored files
          </summary>
          <ul className="text-muted-foreground mt-2 grid gap-1 pl-4">
            {selection.ignoredFiles.map((file) => (
              <li className="list-disc" key={`${file.path}-${file.reason}`}>
                <span className="break-all">{file.path}</span> — {file.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function UploadProgress({ percentage }: { percentage: number }) {
  return (
    <div className="mt-2 grid gap-1.5">
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{percentage === 100 ? "Saving to library" : "Uploading"}</span>
        <span>{percentage}%</span>
      </div>
      <div
        aria-label={`Upload progress: ${percentage}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentage}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function getQueueValidationErrors(
  queue: QueuedFile[],
  existingNames: string[],
  allowedTypes: SourceFileType[],
): Map<string, string> {
  const pendingItems = queue.filter((item) => item.status !== "uploaded");
  const queuedNameCounts = countFileNames(pendingItems);
  const errors = new Map<string, string>();

  for (const item of pendingItems) {
    const fileError = validateFile(item.file, allowedTypes);

    if (fileError) {
      errors.set(item.id, fileError);
      continue;
    }

    if (isExistingName(item.file.name, existingNames)) {
      errors.set(
        item.id,
        "A file with this name already exists in the Source Library.",
      );
      continue;
    }

    if ((queuedNameCounts.get(normalizeFileName(item.file.name)) ?? 0) > 1) {
      errors.set(
        item.id,
        "Another selected file has the same name. Remove one before uploading.",
      );
    }
  }

  return errors;
}

function countFileNames(queue: QueuedFile[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of queue) {
    const normalizedName = normalizeFileName(item.file.name);
    counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
  }

  return counts;
}

function validateFile(
  file: File,
  allowedTypes: SourceFileType[],
): string | null {
  const fileType = getSourceFileType(file.name);

  if (!fileType || !allowedTypes.includes(fileType)) {
    return `Unsupported file type. Choose ${formatAllowedTypes(allowedTypes)}.`;
  }

  if (file.size === 0) {
    return "This file is empty.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "This file is larger than the 250 MB limit.";
  }

  return null;
}

function formatAllowedTypes(allowedTypes: SourceFileType[]): string {
  const labels = allowedTypes.map((type) => type.toUpperCase());

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} or ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function isExistingName(fileName: string, existingNames: string[]): boolean {
  const normalizedName = normalizeFileName(fileName);

  return existingNames.some(
    (existingName) => normalizeFileName(existingName) === normalizedName,
  );
}

function normalizeFileName(fileName: string): string {
  return fileName.trim().toLocaleLowerCase();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function getUploadErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The file could not be uploaded. Try again.";
}
