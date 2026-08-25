"use client";

import { FilePlus2, FileText, FolderOpen, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getWorkspaceSourceFiles,
  updateWorkspaceSourceFiles,
} from "@/features/drafts/workspaces/api";
import { WorkspaceSourceFilePicker } from "@/features/drafts/workspaces/components/workspace-source-file-picker";
import { listSourceFiles } from "@/features/source-library/api";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import type {
  SourceFileListItem,
  WorkspaceSourceFileItem,
} from "@/types/api";

type DialogView = "closed" | "picker" | "upload";

export function WorkspaceSourceFiles({
  disabled,
  onAiSourceFilesChange,
  workspaceId,
}: {
  disabled: boolean;
  onAiSourceFilesChange: (hasFiles: boolean) => void;
  workspaceId: string;
}) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const [availableFiles, setAvailableFiles] = useState<SourceFileListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogView, setDialogView] = useState<DialogView>("closed");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkedFiles, setLinkedFiles] = useState<WorkspaceSourceFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    requestControllerRef.current = controller;

    void getWorkspaceSourceFiles(workspaceId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setLinkedFiles(response.files);
        }
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

    return () => controller.abort();
  }, [workspaceId]);

  const aiFiles = linkedFiles.filter((file) => file.purpose === "ai_input");

  useEffect(() => {
    onAiSourceFilesChange(aiFiles.length > 0);
  }, [aiFiles.length, onAiSourceFilesChange]);

  async function openPicker() {
    setErrorMessage(null);
    setPendingIds(aiFiles.map((file) => file.id));
    setDialogView("picker");
    setPickerLoading(true);

    try {
      const response = await listSourceFiles();
      setAvailableFiles(response.files);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setPickerLoading(false);
    }
  }

  async function saveSelection(sourceFileIds: string[]) {
    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await updateWorkspaceSourceFiles(workspaceId, {
        purpose: "ai_input",
        sourceFileIds,
      });
      setLinkedFiles(response.files);
      setDialogView("closed");
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setBusy(false);
    }
  }

  function handleUploaded(files: SourceFileListItem[]) {
    const uploadedIds = new Set(files.map((file) => file.id));

    setAvailableFiles((current) => [
      ...files,
      ...current.filter((file) => !uploadedIds.has(file.id)),
    ]);
    setPendingIds((current) => [
      ...current,
      ...files.map((file) => file.id).filter((id) => !current.includes(id)),
    ]);
    setDialogView("picker");
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Source files</p>
          <p className="text-muted-foreground max-w-xl text-xs">
            Save reusable files with this workspace for AI course setup
            analysis.
          </p>
        </div>
        {!disabled ? (
          <Button
            className="w-fit"
            disabled={loading}
            onClick={() => void openPicker()}
            type="button"
            variant="outline"
          >
            {loading ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FolderOpen aria-hidden="true" />
            )}
            Choose source files
          </Button>
        ) : null}
      </div>

      {aiFiles.length > 0 ? (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border bg-white">
          {aiFiles.map((file) => (
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
              {!disabled ? (
                <Button
                  aria-label={`Remove ${file.name} from this workspace`}
                  disabled={busy}
                  onClick={() =>
                    void saveSelection(
                      aiFiles
                        .filter((linkedFile) => linkedFile.id !== file.id)
                        .map((linkedFile) => linkedFile.id),
                    )
                  }
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border bg-background grid justify-items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center">
          <FilePlus2 aria-hidden="true" className="text-muted-foreground size-5" />
          <p className="text-sm font-semibold">No source files selected</p>
          <p className="text-muted-foreground text-xs">
            You can still generate from the brief or transcript above.
          </p>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Selected files are analyzed when you generate the course setup.
      </p>
      {errorMessage && dialogView === "closed" ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {dialogView === "picker" ? (
        <WorkspaceSourceFilePicker
          busy={busy}
          errorMessage={errorMessage}
          files={availableFiles}
          loading={pickerLoading}
          onApply={() => void saveSelection(pendingIds)}
          onClose={() => setDialogView("closed")}
          onSelectedIdsChange={setPendingIds}
          onUpload={() => setDialogView("upload")}
          selectedIds={pendingIds}
        />
      ) : null}
      {dialogView === "upload" ? (
        <SourceUploadDialog
          existingNames={availableFiles.map((file) => file.name)}
          onClose={() => setDialogView("picker")}
          onOpenExisting={(fileName) => {
            const normalizedName = fileName.toLocaleLowerCase();
            const existingFile = availableFiles.find(
              (file) => file.name.toLocaleLowerCase() === normalizedName,
            );

            if (existingFile && !pendingIds.includes(existingFile.id)) {
              setPendingIds((current) => [...current, existingFile.id]);
            }
            setDialogView("picker");
          }}
          onUpload={handleUploaded}
          open
        />
      ) : null}
    </section>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Source files could not be updated.";
}
