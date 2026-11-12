"use client";

import { ArrowUp, LoaderCircle, Paperclip } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { PromptFileChip } from "@/features/drafts/workspaces/components/prompt-file-chip";
import {
  kyronAttachmentOf,
  MAX_PROMPT_FILES,
  PROMPT_FILE_ACCEPT,
  type PromptFile,
} from "@/features/drafts/workspaces/prompt-files";
import { cn } from "@/lib/utils";
import { COURSE_BRIEF_MAX_LENGTH } from "@/types/api";

const MAX_TEXTAREA_HEIGHT = 360;

// The one box a new draft starts from: a prompt, files, and a send button.
// Enter sends and Shift+Enter starts a new line; on touch screens Enter is a
// new line and the button sends. Files can also be dropped anywhere on the
// page (the page handles the drop; dragging only shows it here).
export function PromptComposer({
  blockedReason,
  busy,
  canSubmit,
  dragging,
  files,
  filesFull,
  onAddFiles,
  onChange,
  onRemoveFile,
  onRetryFile,
  onSubmit,
  textareaRef,
  value,
}: {
  // Why sending is not possible yet, shown beside the button.
  blockedReason: string | null;
  busy: boolean;
  canSubmit: boolean;
  dragging: boolean;
  files: PromptFile[];
  filesFull: boolean;
  onAddFiles: (files: File[]) => void;
  onChange: (value: string) => void;
  onRemoveFile: (key: string) => void;
  onRetryFile: (key: string) => void;
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kyronFileKey = kyronAttachmentOf(files)?.key ?? null;

  useAutoHeight(textareaRef, value);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;

    if (event.key !== "Enter" || event.shiftKey || composing || isTouchScreen()) {
      return;
    }

    event.preventDefault();

    if (canSubmit && !busy) {
      onSubmit();
    }
  }

  return (
    <form
      aria-busy={busy}
      className={cn(
        "relative rounded-2xl border border-border bg-card shadow-sm transition-[border-color,box-shadow]",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15",
        dragging && "border-primary ring-3 ring-primary/15",
      )}
      onSubmit={(event) => {
        event.preventDefault();

        if (canSubmit && !busy) {
          onSubmit();
        }
      }}
    >
      <label className="sr-only" htmlFor="course-prompt">
        Describe the course
      </label>
      <textarea
        aria-describedby="course-prompt-hint"
        aria-disabled={busy}
        className="block max-h-[360px] min-h-28 w-full resize-none overflow-y-auto rounded-t-2xl bg-transparent px-5 pt-5 pb-3 text-base leading-relaxed outline-none placeholder:text-muted-foreground/70 aria-disabled:opacity-70"
        id="course-prompt"
        maxLength={COURSE_BRIEF_MAX_LENGTH}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the course: what it should teach, to whom, and how long it should run. You can also paste notes or a transcript."
        readOnly={busy}
        ref={textareaRef}
        rows={3}
        value={value}
      />

      {files.length > 0 ? (
        <ul aria-label="Added files" className="flex flex-wrap gap-2 px-4 pb-3">
          {files.map((file) => (
            <PromptFileChip
              disabled={busy}
              file={file}
              key={file.key}
              onRemove={() => onRemoveFile(file.key)}
              onRetry={() => onRetryFile(file.key)}
              sentToKyron={file.key === kyronFileKey}
            />
          ))}
        </ul>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {filesSummary(files)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 px-3 py-2.5">
        <input
          accept={PROMPT_FILE_ACCEPT}
          aria-label="Add source files"
          className="sr-only"
          multiple
          onChange={(event) => {
            const picked = Array.from(event.currentTarget.files ?? []);

            event.currentTarget.value = "";
            if (picked.length > 0) {
              onAddFiles(picked);
            }
          }}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <Button
          disabled={busy || filesFull}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Paperclip aria-hidden="true" />
          {filesFull ? `${MAX_PROMPT_FILES} files added` : "Add files"}
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <span
            className={cn("text-right text-xs text-muted-foreground", !blockedReason && "sr-only sm:not-sr-only")}
            id="course-prompt-hint"
          >
            {blockedReason ?? "Enter to start · Shift + Enter for a new line"}
          </span>
          <Button
            aria-describedby="course-prompt-hint"
            aria-label="Start planning"
            className="rounded-full"
            disabled={!canSubmit || busy}
            size="icon"
            type="submit"
          >
            {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ArrowUp aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-card/90 px-6 text-center text-sm font-medium text-primary">
          {busy
            ? "Wait until the draft is started"
            : filesFull
              ? `Up to ${MAX_PROMPT_FILES} files can be added`
              : "Drop PDF, PowerPoint or Word files"}
        </div>
      ) : null}
    </form>
  );
}

// The box grows with its text, then scrolls.
function useAutoHeight(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const textarea = ref.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [ref, value]);
}

// Touch keyboards cannot send Shift+Enter, so Enter adds a line there.
function isTouchScreen(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

// Read out when files are added, finish uploading or fail.
function filesSummary(files: PromptFile[]): string {
  if (files.length === 0) {
    return "";
  }

  const uploading = files.filter((file) => file.status === "uploading").length;
  const failed = files.filter((file) => file.status === "error").length;
  const ready = files.length - uploading - failed;
  const parts = [
    ready > 0 ? `${ready} ready` : null,
    uploading > 0 ? `${uploading} uploading` : null,
    failed > 0 ? `${failed} could not be added` : null,
  ].filter(Boolean);

  return `${files.length} ${files.length === 1 ? "file" : "files"}: ${parts.join(", ")}.`;
}
