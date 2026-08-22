"use client";

import {
  CircleAlert,
  FileText,
  Link2,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SourceFileRecord,
  SourceFileUsagePurpose,
} from "@/features/source-library/types";

type SourceFileUsageDialogProps = {
  file: SourceFileRecord | null;
  onClose: () => void;
  workspaceHref?: (workspaceId: string) => string;
};

export function SourceFileUsageDialog({
  file,
  onClose,
  workspaceHref = () => "/design-preview?view=drafts",
}: SourceFileUsageDialogProps) {
  useEscapeKey(Boolean(file), onClose);

  if (!file) {
    return null;
  }

  const workspaceCount = new Set(
    file.usages.map((usage) => usage.workspaceId),
  ).size;

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
        aria-labelledby="source-usage-title"
        aria-modal="true"
        className="bg-card max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold" id="source-usage-title">
                File usage
              </h2>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {file.name}
              </p>
            </div>
          </div>
          <Button
            aria-label="Close file usage"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold">Linked workspaces</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Referenced by {workspaceCount} workspace
                {workspaceCount === 1 ? "" : "s"}.
              </p>
            </div>
            <Badge variant="outline">{file.usages.length} links</Badge>
          </div>

          <ul className="border-border mt-4 divide-y overflow-hidden rounded-xl border">
            {file.usages.map((usage, index) => (
              <li
                className="flex items-start gap-3 p-4"
                key={`${usage.workspaceId}-${usage.purpose}-${index}`}
              >
                <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{usage.workspaceTitle}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {USAGE_LABELS[usage.purpose]}
                  </p>
                </div>
                <Link
                  className="text-primary shrink-0 text-xs font-semibold underline-offset-4 hover:underline"
                  href={workspaceHref(usage.workspaceId)}
                >
                  View drafts
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-border flex justify-end border-t px-5 py-4">
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </footer>
      </section>
    </div>
  );
}

type DeleteSourceFileDialogProps = {
  busy?: boolean;
  errorMessage?: string | null;
  file: SourceFileRecord | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
};

export function DeleteSourceFileDialog({
  busy = false,
  errorMessage,
  file,
  onClose,
  onConfirm,
}: DeleteSourceFileDialogProps) {
  useEscapeKey(Boolean(file) && !busy, onClose);

  if (!file) {
    return null;
  }

  const isBlocked = file.usages.length > 0;
  const workspaceCount = new Set(
    file.usages.map((usage) => usage.workspaceId),
  ).size;

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
        aria-labelledby="delete-source-title"
        aria-modal="true"
        className="bg-card w-full max-w-md rounded-xl p-5 ring-1 ring-black/10"
        role="alertdialog"
      >
        <span className="bg-destructive/10 text-destructive grid size-10 place-items-center rounded-lg">
          {isBlocked ? (
            <CircleAlert aria-hidden="true" className="size-5" />
          ) : (
            <Trash2 aria-hidden="true" className="size-5" />
          )}
        </span>
        <h2 className="mt-4 text-lg font-bold" id="delete-source-title">
          {isBlocked ? "This file cannot be deleted" : "Delete source file?"}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {isBlocked
            ? `${file.name} is used by ${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}. Remove those references before deleting the file.`
            : `${file.name} will be permanently removed from the Source Library.`}
        </p>
        {errorMessage ? (
          <p className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3 py-2 text-xs">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">
            {isBlocked ? "Close" : "Cancel"}
          </Button>
          {!isBlocked ? (
            <Button
              disabled={busy}
              onClick={() => onConfirm(file.id)}
              type="button"
              variant="destructive"
            >
              {busy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {busy ? "Deleting..." : "Delete file"}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape]);
}

const USAGE_LABELS: Record<SourceFileUsagePurpose, string> = {
  ai_input: "Used to generate the AI course setup",
  kyron_attachment: "Selected as the draft source attachment",
};
