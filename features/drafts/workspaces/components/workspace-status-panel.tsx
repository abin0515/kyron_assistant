import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DraftPollingState } from "@/features/drafts/kyron-drafts/types";
import { DraftStatusBadge } from "@/features/drafts/shared/components/draft-status-badge";
import { getPollingDraftDisplayStatus } from "@/features/drafts/shared/status";
import { DeleteWorkspaceButton } from "@/features/drafts/workspaces/components/delete-workspace-button";
import type { WorkspaceAutosaveState } from "@/features/drafts/workspaces/hooks/use-workspace-autosave";
import type { DraftWorkspace } from "@/types/api";

type WorkspaceStatusPanelProps = {
  autosaveState: WorkspaceAutosaveState;
  includeInCalibration: boolean;
  onCalibrationSelectionChange: (selected: boolean) => void;
  onCheckNow: () => void;
  onDeleted: () => void;
  onSubmit: () => void;
  pollingState: DraftPollingState;
  ready: boolean;
  submissionBusy: boolean;
  submissionError: string | null;
  workspace: DraftWorkspace;
};

export function WorkspaceStatusPanel({
  autosaveState,
  includeInCalibration,
  onCalibrationSelectionChange,
  onCheckNow,
  onDeleted,
  onSubmit,
  pollingState,
  ready,
  submissionBusy,
  submissionError,
  workspace,
}: WorkspaceStatusPanelProps) {
  if (workspace.kyronDraftId) {
    return (
      <SubmittedDraftStatus
        onCheckNow={onCheckNow}
        onDeleted={onDeleted}
        pollingState={pollingState}
        workspace={workspace}
      />
    );
  }

  const saved = !["pending", "saving", "error"].includes(
    autosaveState.phase,
  );
  const canSubmit = ready && saved && !submissionBusy;

  return (
    <Card className="sticky top-24 min-w-0 gap-0 rounded-xl border-border py-0 ring-1 ring-border">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
        <CardTitle className="text-base font-light">Draft readiness</CardTitle>
        <DraftStatusBadge
          status={workspace.status === "error" ? "attention" : "editing"}
        />
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5">
        <div className="grid gap-3">
          <ReadinessItem complete>
            Source information is optional
          </ReadinessItem>
          <ReadinessItem complete={ready}>
            Course setup is complete
          </ReadinessItem>
          <ReadinessItem complete={saved}>
            Latest changes are saved
          </ReadinessItem>
        </div>

        {submissionError || workspace.status === "error" ? (
          <p className="text-sm leading-relaxed text-primary" role="alert">
            {submissionError || workspace.statusMessage}
          </p>
        ) : null}

        {workspace.courseSetupCalibration ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <input
              checked={includeInCalibration}
              className="mt-0.5 size-4 shrink-0 accent-primary"
              disabled={submissionBusy}
              onChange={(event) =>
                onCalibrationSelectionChange(event.currentTarget.checked)
              }
              type="checkbox"
            />
            <span className="grid gap-1">
              <span className="text-sm font-semibold">
                Use this setup as a calibration example
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Save the AI recommendation and final submitted setup to help
                improve future course setup suggestions.
              </span>
            </span>
          </label>
        ) : null}

        <Button
          className="min-h-10 w-full font-semibold"
          disabled={!canSubmit}
          onClick={onSubmit}
          type="button"
        >
          {submissionBusy ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Creating draft…
            </>
          ) : (
            "Create course draft"
          )}
        </Button>

        {!ready ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Complete the title, description, learning objective, and audience
            before creating the draft.
          </p>
        ) : null}

        {!submissionBusy &&
        (workspace.status === "editing" || workspace.status === "error") ? (
          <div className="flex justify-end border-t border-border pt-4">
            <DeleteWorkspaceButton
              label="Delete workspace"
              onDeleted={onDeleted}
              workspaceId={workspace.id}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SubmittedDraftStatus({
  onCheckNow,
  onDeleted,
  pollingState,
  workspace,
}: {
  onCheckNow: () => void;
  onDeleted: () => void;
  pollingState: DraftPollingState;
  workspace: DraftWorkspace;
}) {
  const draft = pollingState.draft;
  const displayStatus = getPollingDraftDisplayStatus(pollingState.phase);

  return (
    <Card className="sticky top-24 min-w-0 gap-0 rounded-xl border-border py-0 ring-1 ring-border">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
        <CardTitle className="text-base font-light">Draft status</CardTitle>
        <DraftStatusBadge status={displayStatus} />
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5">
        <div className="grid gap-2">
          <h2 className="text-lg font-bold">
            {statusHeading(pollingState.phase)}
          </h2>
          <p className="max-h-40 overflow-y-auto text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
            {statusMessage(pollingState, workspace)}
          </p>
        </div>

        {draft &&
        (pollingState.phase === "complete" ||
          pollingState.phase === "generation_error") ? (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <a
                className={buttonVariants({
                  className: "min-h-10",
                  variant: "outline",
                })}
                href={draft.previewUrl}
                rel="noreferrer"
                target="_blank"
              >
                Preview
                <ExternalLink aria-hidden="true" />
              </a>
              <a
                className={buttonVariants({ className: "min-h-10" })}
                href={draft.editorUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open editor
                <ExternalLink aria-hidden="true" />
              </a>
            </div>
            <Button
              className="w-fit"
              onClick={onCheckNow}
              size="sm"
              type="button"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" />
              Check status again
            </Button>
          </div>
        ) : (
          <Button
            className="min-h-10 w-fit"
            disabled={pollingState.phase === "checking"}
            onClick={onCheckNow}
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={
                pollingState.phase === "checking" ? "animate-spin" : undefined
              }
            />
            Check now
          </Button>
        )}

        <div className="border-t border-border pt-4 text-xs text-muted-foreground">
          <p>Draft {workspace.kyronDraftId}</p>
          {pollingState.lastCheckedAt ? (
            <p className="mt-1">
              Checked {formatTime(pollingState.lastCheckedAt)}
            </p>
          ) : null}
        </div>

        {pollingState.phase === "unavailable" ? (
          <div className="flex justify-end border-t border-border pt-4">
            <DeleteWorkspaceButton
              label="Delete workspace"
              onDeleted={onDeleted}
              workspaceId={workspace.id}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReadinessItem({
  children,
  complete,
}: {
  children: React.ReactNode;
  complete: boolean;
}) {
  return (
    <p className="flex items-center gap-2 text-sm">
      {complete ? (
        <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <TriangleAlert
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
      )}
      {children}
    </p>
  );
}

function statusHeading(phase: DraftPollingState["phase"]): string {
  if (phase === "complete") {
    return "Ready for review";
  }

  if (phase === "generation_error") {
    return "Generation needs attention";
  }

  if (phase === "unavailable") {
    return "Not found in Kyron";
  }

  if (phase === "request_error") {
    return "Status unavailable";
  }

  return "Generating course draft";
}

function statusMessage(
  pollingState: DraftPollingState,
  workspace: DraftWorkspace,
): string {
  if (pollingState.phase === "unavailable") {
    return "This draft could not be found in Kyron. It may have been deleted or is no longer accessible.";
  }

  return (
    pollingState.errorMessage ||
    pollingState.draft?.statusMessage ||
    workspace.statusMessage ||
    "Checking the latest generation status."
  );
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
