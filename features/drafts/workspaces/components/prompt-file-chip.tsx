import { CircleAlert, FileText, LoaderCircle, RotateCw, X } from "lucide-react";

import type { PromptFile } from "@/features/drafts/workspaces/prompt-files";
import { cn } from "@/lib/utils";

// One added file: its name, then upload progress, size, or what went wrong.
export function PromptFileChip({
  disabled,
  file,
  onRemove,
  onRetry,
  sentToKyron,
}: {
  disabled: boolean;
  file: PromptFile;
  onRemove: () => void;
  onRetry: () => void;
  // This is the file Kyron receives as the course material.
  sentToKyron: boolean;
}) {
  const failed = file.status === "error";

  return (
    <li
      className={cn(
        "flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1 pl-2.5 text-sm",
        failed ? "border-destructive/30 bg-destructive/5" : "border-border",
      )}
    >
      {file.status === "uploading" ? (
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : failed ? (
        <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
      ) : (
        <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="grid min-w-0 leading-tight">
        <span className="max-w-56 truncate font-medium" title={file.name}>
          {file.name}
        </span>
        <span className={cn("max-w-64 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
          {chipDetail(file, sentToKyron)}
        </span>
      </div>
      {failed && file.retryable ? (
        <button
          aria-label={`Try uploading ${file.name} again`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={disabled}
          onClick={onRetry}
          type="button"
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      <button
        aria-label={`Remove ${file.name}`}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        disabled={disabled}
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </li>
  );
}

function chipDetail(file: PromptFile, sentToKyron: boolean): string {
  if (file.status === "uploading") {
    return file.progress > 0 ? `Uploading… ${file.progress}%` : "Uploading…";
  }

  if (file.status === "error") {
    return file.error ?? "The file could not be uploaded.";
  }

  if (!file.aiReadable) {
    return sentToKyron
      ? "Sent to Kyron only: too large for the AI to read (over 50 MB)"
      : "Not used: too large for the AI, and only one file goes to Kyron";
  }

  const details = [
    file.reused ? "Using the copy in your Source Library" : formatFileSize(file.size),
    sentToKyron ? "also sent to Kyron" : null,
  ];

  return details.filter(Boolean).join(" · ");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
