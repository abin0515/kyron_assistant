"use client";

import {
  CircleAlert,
  CircleCheck,
  FilePlus2,
  FileText,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { uploadSourceFile } from "@/features/source-library/api";
import { getSourceFileType } from "@/features/source-library/sample-data";
import type {
  SourceFileType,
  SourceFileUploadAction,
} from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

const MAX_FILE_SIZE = 250 * 1_048_576;
const DEFAULT_ALLOWED_TYPES: SourceFileType[] = ["pdf", "pptx", "docx"];

type SourceUploadDialogProps = {
  allowedTypes?: SourceFileType[];
  existingNames: string[];
  open: boolean;
  onClose: () => void;
  onOpenExisting: (fileName: string) => void;
  onUpload: (files: SourceFileListItem[]) => void;
  uploadFile?: SourceFileUploadAction;
};

type QueuedFile = {
  error: string | null;
  file: File;
  id: string;
  progress: number;
  status: "ready" | "uploading" | "uploaded" | "failed";
  type: SourceFileType | null;
};

export function SourceUploadDialog({
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  existingNames,
  open,
  onClose,
  onOpenExisting,
  onUpload,
  uploadFile = uploadSourceFile,
}: SourceUploadDialogProps) {
  const uploadControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);

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
  const uploadableFiles = queue.filter(
    (item) => !item.error && item.status !== "uploaded",
  );
  const allowedTypeLabel = formatAllowedTypes(allowedTypes);

  function handleFiles(files: File[]) {
    setQueue((current) => {
      const queuedNames = current.map((item) => item.file.name);
      const namesToCheck = [...existingNames, ...queuedNames];

      const additions = files.map((file, index) => {
        const error = validateFile(file, namesToCheck, allowedTypes);
        namesToCheck.push(file.name);

        return {
          file,
          error,
          type: getSourceFileType(file.name),
          id: `${file.name}-${file.lastModified}-${index}-${Date.now()}`,
          progress: 0,
          status: "ready" as const,
        };
      });

      return [...current, ...additions];
    });
  }

  function handleClose() {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setQueue([]);
    setDragActive(false);
    onClose();
  }

  async function handleUpload() {
    if (uploadableFiles.length === 0 || uploading) {
      return;
    }

    const controller = new AbortController();
    uploadControllerRef.current = controller;

    setQueue((current) =>
      current.map((item) =>
        uploadableFiles.some((upload) => upload.id === item.id)
          ? { ...item, error: null, progress: 0, status: "uploading" }
          : item,
      ),
    );

    const results = await Promise.allSettled(
      uploadableFiles.map((item) => uploadQueuedFile(item, controller)),
    );

    if (controller.signal.aborted) {
      return;
    }

    uploadControllerRef.current = null;
    const uploadedFiles = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    if (uploadedFiles.length > 0) {
      onUpload(uploadedFiles);
    }
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
          error: getUploadErrorMessage(error),
          progress: 0,
          status: "failed",
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
              handleFiles(Array.from(event.dataTransfer.files));
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
              <Button
                className="mt-4"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                type="button"
                variant="outline"
              >
                <FilePlus2 aria-hidden="true" />
                Choose files
              </Button>
              <input
                accept={allowedTypes.map((type) => `.${type}`).join(",")}
                className="sr-only"
                disabled={uploading}
                multiple
                onChange={(event) => {
                  handleFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                ref={inputRef}
                type="file"
              />
            </div>
          </div>

          {queue.length > 0 ? (
            <div className="border-border overflow-hidden rounded-xl border">
              <div className="border-border bg-muted/35 flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-bold">Upload queue</p>
                <button
                  className="text-muted-foreground hover:text-foreground text-xs font-medium"
                  disabled={uploading}
                  onClick={() => setQueue([])}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <ul className="divide-border divide-y">
                {queue.map((item) => (
                  <li className="flex items-start gap-3 px-4 py-3" key={item.id}>
                    <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatFileSize(item.file.size)}
                      </p>
                      {item.error ? (
                        <div className="text-primary mt-2 flex items-start gap-1.5 text-xs">
                          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                          <span>{item.error}</span>
                        </div>
                      ) : null}
                      {item.status === "uploading" ? (
                        <UploadProgress percentage={item.progress} />
                      ) : null}
                      {item.status === "uploaded" ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CircleCheck aria-hidden="true" className="size-3.5" />
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
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="border-border flex flex-col-reverse justify-end gap-2 border-t px-5 py-4 sm:flex-row">
          <Button onClick={handleClose} type="button" variant="outline">
            {uploading ? "Cancel upload" : "Close"}
          </Button>
          <Button
            disabled={uploadableFiles.length === 0 || uploading}
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
              : `Upload ${uploadableFiles.length || ""} file${
                  uploadableFiles.length === 1 ? "" : "s"
                }`}
          </Button>
        </footer>
      </section>
    </div>
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

function validateFile(
  file: File,
  existingNames: string[],
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

  if (isExistingName(file.name, existingNames)) {
    return "A file with this name already exists in the Source Library.";
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
  const normalizedName = fileName.trim().toLocaleLowerCase();

  return existingNames.some(
    (existingName) => existingName.trim().toLocaleLowerCase() === normalizedName,
  );
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
