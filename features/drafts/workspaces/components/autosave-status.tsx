import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";

import type { WorkspaceAutosaveState } from "@/features/drafts/workspaces/hooks/use-workspace-autosave";

export function AutosaveStatus({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: WorkspaceAutosaveState;
}) {
  if (state.phase === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
        <TriangleAlert aria-hidden="true" className="size-4" />
        <span>{state.errorMessage ?? "Save failed."}</span>
        <button
          className="font-semibold underline underline-offset-2"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.phase === "pending") {
    return <p className="text-xs text-muted-foreground">Unsaved changes</p>;
  }

  if (state.phase === "saving") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
        Saving…
      </p>
    );
  }

  if (state.phase === "saved") {
    return (
      <p className="flex items-center gap-2 text-xs text-secondary-foreground" role="status">
        <CircleCheck aria-hidden="true" className="size-3.5" />
        Saved{state.savedAt ? ` at ${formatTime(state.savedAt)}` : ""}
      </p>
    );
  }

  return <p className="text-xs text-muted-foreground">Saved in workspace</p>;
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}
