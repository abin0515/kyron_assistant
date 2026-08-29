"use client";

import {
  FileText,
  FolderOpen,
  LoaderCircle,
  Paperclip,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getWorkspaceSourceFiles,
  updateWorkspaceSourceFiles,
} from "@/features/drafts/workspaces/api";
import { WorkspaceSourceFilePicker } from "@/features/drafts/workspaces/components/workspace-source-file-picker";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import type {
  SourceFileListItem,
  WorkspaceSourceFileItem,
} from "@/types/api";

type DialogView = "closed" | "picker" | "upload";

export function WorkspaceDraftAttachment({
  disabled,
  workspaceId,
}: {
  disabled: boolean;
  workspaceId: string;
}) {
  const [availableFiles, setAvailableFiles] = useState<SourceFileListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogView, setDialogView] = useState<DialogView>("closed");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkedFiles, setLinkedFiles] = useState<WorkspaceSourceFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();

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
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  const attachment = linkedFiles.find(
    (file) => file.purpose === "kyron_attachment",
  );
  const attachmentFiles = useMemo(
    () => availableFiles.filter(isKyronAttachment),
    [availableFiles],
  );

  function openPicker() {
    setErrorMessage(null);
    setPendingIds(attachment ? [attachment.id] : []);
    setDialogView("picker");
  }

  async function saveSelection(sourceFileIds: string[]) {
    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await updateWorkspaceSourceFiles(workspaceId, {
        purpose: "kyron_attachment",
        sourceFileIds: sourceFileIds.slice(0, 1),
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
    const firstAttachment = files.find(isKyronAttachment);

    setAvailableFiles((current) => [
      ...files,
      ...current.filter((file) => !uploadedIds.has(file.id)),
    ]);
    setPendingIds(firstAttachment ? [firstAttachment.id] : []);
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
            disabled={loading}
            onClick={openPicker}
            type="button"
            variant="outline"
          >
            {loading ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FolderOpen aria-hidden="true" />
            )}
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
              disabled={busy}
              onClick={() => void saveSelection([])}
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

      {errorMessage && dialogView === "closed" ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {dialogView === "picker" ? (
        <WorkspaceSourceFilePicker
          busy={busy}
          emptyDescription="Only PDF and PPTX files can be attached. DOCX files remain available for AI course setup analysis."
          errorMessage={errorMessage}
          initialFiles={attachmentFiles}
          onApply={() => void saveSelection(pendingIds)}
          onClose={() => setDialogView("closed")}
          onFilesChange={setAvailableFiles}
          onSelectedIdsChange={setPendingIds}
          onUpload={() => setDialogView("upload")}
          selectedIds={pendingIds}
          selectionMode="single"
          types={["pdf", "pptx"]}
        />
      ) : null}
      {dialogView === "upload" ? (
        <SourceUploadDialog
          allowedTypes={["pdf", "pptx"]}
          existingNames={availableFiles.map((file) => file.name)}
          onClose={() => setDialogView("picker")}
          onOpenExisting={(fileName) => {
            const normalizedName = fileName.toLocaleLowerCase();
            const existingFile = attachmentFiles.find(
              (file) => file.name.toLocaleLowerCase() === normalizedName,
            );

            setPendingIds(existingFile ? [existingFile.id] : []);
            setDialogView("picker");
          }}
          onUpload={handleUploaded}
          open
        />
      ) : null}
    </section>
  );
}

function isKyronAttachment(file: SourceFileListItem): boolean {
  return file.type === "pdf" || file.type === "pptx";
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
    : "The draft attachment could not be updated.";
}
