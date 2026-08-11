"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { deleteDraftWorkspace } from "@/features/drafts/workspaces/api";

export function DeleteWorkspaceButton({
  label = "Delete",
  onDeleted,
  workspaceId,
}: {
  label?: string;
  onDeleted: () => void;
  workspaceId: string;
}) {
  const controllerRef = useRef<AbortController | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  async function handleDelete() {
    const controller = new AbortController();
    controllerRef.current = controller;
    setDeleting(true);
    setErrorMessage(null);

    try {
      await deleteDraftWorkspace(workspaceId, controller.signal);

      if (!controller.signal.aborted) {
        onDeleted();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setDeleting(false);
      }
    }
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden="true" />
        {label}
      </Button>
    );
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <div
        aria-label="Confirm workspace deletion"
        className="flex flex-wrap justify-end gap-1.5"
        role="group"
      >
        <Button
          disabled={deleting}
          onClick={() => {
            setConfirming(false);
            setErrorMessage(null);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={deleting}
          onClick={() => void handleDelete()}
          size="sm"
          type="button"
          variant="destructive"
        >
          {deleting ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" />
          )}
          Confirm delete
        </Button>
      </div>
      {errorMessage ? (
        <p className="max-w-64 text-right text-xs text-primary" role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className="max-w-64 text-right text-xs text-muted-foreground">
          This permanently removes the saved setup.
        </p>
      )}
    </div>
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The workspace could not be deleted.";
}
