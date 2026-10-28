"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useDraftPolling } from "@/features/drafts/kyron-drafts/hooks/use-draft-polling";
import { DraftApiError } from "@/features/drafts/shared/api-response";
import { DraftStatusBadge } from "@/features/drafts/shared/components/draft-status-badge";
import { getWorkspaceEditorDisplayStatus } from "@/features/drafts/shared/status";
import { AutosaveStatus } from "@/features/drafts/workspaces/components/autosave-status";
import { CourseSourceCard } from "@/features/drafts/workspaces/components/course-source-card";
import { WorkspaceForm } from "@/features/drafts/workspaces/components/workspace-form";
import { WorkspaceStatusPanel } from "@/features/drafts/workspaces/components/workspace-status-panel";
import { useCourseSetupGenerator } from "@/features/drafts/workspaces/hooks/use-course-setup-generator";
import { useWorkspaceAutosave } from "@/features/drafts/workspaces/hooks/use-workspace-autosave";
import {
  getDraftWorkspace,
  submitDraftWorkspace,
  updateWorkspaceKyronDestination,
} from "@/features/drafts/workspaces/api";
import { courseSetupsMatch } from "@/lib/course-setup";
import type { DraftWorkspace, KyronDestination } from "@/types/api";

export function WorkspaceEditor({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const submissionControllerRef = useRef<AbortController | null>(null);
  const [includeInCalibration, setIncludeInCalibration] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [regenerationDialog, setRegenerationDialog] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<DraftWorkspace | null>(null);

  const handleSaved = useCallback((savedWorkspace: DraftWorkspace) => {
    setWorkspace(savedWorkspace);
  }, []);
  const autosave = useWorkspaceAutosave(handleSaved);
  const generator = useCourseSetupGenerator();
  const polling = useDraftPolling(workspace?.kyronDraftId ?? null);

  useEffect(() => {
    const controller = new AbortController();

    void getDraftWorkspace(workspaceId, controller.signal)
      .then((loadedWorkspace) => {
        if (!controller.signal.aborted) {
          setWorkspace(loadedWorkspace);
          setIncludeInCalibration(
            loadedWorkspace.courseSetupCalibration?.includeInCalibration ??
              false,
          );
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(messageFromError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId]);

  useEffect(
    () => () => {
      submissionControllerRef.current?.abort();
    },
    [],
  );

  function handleWorkspaceChange(nextWorkspace: DraftWorkspace) {
    setFieldErrors({});
    setSubmissionError(null);
    setIncludeInCalibration(false);
    setWorkspace(nextWorkspace);
    autosave.queueSave(nextWorkspace);
  }

  function handleSourceChange(sourceText: string) {
    if (!workspace) {
      return;
    }

    generator.reset();
    handleWorkspaceChange({ ...workspace, sourceText });
  }

  async function handleDestinationChange(destination: KyronDestination) {
    if (!workspace) {
      return;
    }

    const saved = await updateWorkspaceKyronDestination(
      workspace.id,
      destination,
    );

    setWorkspace((current) =>
      current
        ? {
            ...current,
            kyronDestination: saved.kyronDestination,
            recordUpdatedAt: saved.recordUpdatedAt,
          }
        : current,
    );
  }

  function handleGenerateRequest() {
    if (!workspace) {
      return;
    }

    const calibration = workspace.courseSetupCalibration;

    if (
      calibration &&
      !courseSetupsMatch(workspace, calibration.generatedSetup)
    ) {
      setRegenerationDialog(true);
      return;
    }

    void handleGenerate();
  }

  async function handleGenerate() {
    if (!workspace) {
      return;
    }

    setRegenerationDialog(false);

    try {
      const savedWorkspace = await autosave.saveNow(workspace);
      const generatedWorkspace = await generator.generate({
        workspaceId: savedWorkspace.id,
      });

      if (generatedWorkspace) {
        setWorkspace(generatedWorkspace);
        setIncludeInCalibration(false);
      }
    } catch {
      // Autosave exposes its own actionable error state.
    }
  }

  async function handleSubmit() {
    if (!workspace || submissionBusy) {
      return;
    }

    submissionControllerRef.current?.abort();
    const controller = new AbortController();
    submissionControllerRef.current = controller;
    setFieldErrors({});
    setSubmissionBusy(true);
    setSubmissionError(null);

    try {
      const savedWorkspace = await autosave.saveNow(workspace);
      const submittedWorkspace = await submitDraftWorkspace(
        savedWorkspace.id,
        includeInCalibration,
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setWorkspace(submittedWorkspace);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSubmissionError(messageFromError(error));

        if (error instanceof DraftApiError && error.fieldErrors) {
          setFieldErrors(error.fieldErrors);
        }
      }
    } finally {
      if (submissionControllerRef.current === controller) {
        submissionControllerRef.current = null;
        setSubmissionBusy(false);
      }
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (loadError || !workspace) {
    return <ErrorState message={loadError || "Draft workspace not found."} />;
  }

  const locked = Boolean(workspace.kyronDraftId) || submissionBusy;
  const ready = hasRequiredCourseSetup(workspace);

  return (
    <div className="mx-auto grid max-w-6xl gap-7">
      <PageHeader
        description={
          <div className="flex flex-wrap items-center gap-3">
            <DraftStatusBadge
              status={getWorkspaceEditorDisplayStatus(
                workspace,
                polling.state.phase,
              )}
            />
            {!workspace.kyronDraftId ? (
              <AutosaveStatus
                onRetry={autosave.retrySave}
                state={autosave.state}
              />
            ) : null}
          </div>
        }
        eyebrow={
          <Link
            className={buttonVariants({
              className: "-ml-3 w-fit text-muted-foreground",
              size: "sm",
              variant: "ghost",
            })}
            href="/drafts"
          >
            <ArrowLeft aria-hidden="true" />
            Back to drafts
          </Link>
        }
        title={workspace.name || "Untitled draft"}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_316px]">
        <div className="grid min-w-0 gap-5">
          <CourseSourceCard
            disabled={locked}
            generatorState={generator.state}
            hasGeneratedSetup={Boolean(workspace.courseSetupCalibration)}
            onGenerate={handleGenerateRequest}
            onSourceChange={handleSourceChange}
            sourceText={workspace.sourceText}
            workspaceId={workspace.id}
          />
          <WorkspaceForm
            destinationDisabled={locked}
            disabled={locked || generator.state.phase === "generating"}
            fieldErrors={fieldErrors}
            onDestinationChange={handleDestinationChange}
            onChange={handleWorkspaceChange}
            workspace={workspace}
          />
        </div>

        <WorkspaceStatusPanel
          autosaveState={autosave.state}
          includeInCalibration={includeInCalibration}
          onCalibrationSelectionChange={setIncludeInCalibration}
          onCheckNow={polling.checkNow}
          onDeleted={() => {
            router.replace("/drafts");
            router.refresh();
          }}
          onSubmit={() => void handleSubmit()}
          pollingState={polling.state}
          ready={ready}
          submissionBusy={submissionBusy}
          submissionError={submissionError}
          workspace={workspace}
        />
      </div>
      {regenerationDialog ? (
        <RegenerationDialog
          onCancel={() => setRegenerationDialog(false)}
          onConfirm={() => void handleGenerate()}
        />
      ) : null}
    </div>
  );
}

function RegenerationDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby="regenerate-course-setup-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        role="dialog"
      >
        <h2 className="text-lg font-bold" id="regenerate-course-setup-title">
          Regenerate course setup?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You have edited the current course setup. Regenerating will replace
          those changes with a new AI recommendation.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            Regenerate
          </Button>
        </div>
      </section>
    </div>
  );
}

function hasRequiredCourseSetup(workspace: DraftWorkspace): boolean {
  return [
    workspace.name,
    workspace.description,
    workspace.learningObjective,
    workspace.audience,
  ].every((value) => value.trim().length > 0);
}

function LoadingState() {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid gap-4 px-6 py-8" aria-label="Loading draft workspace">
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted/70" />
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="grid gap-4 px-6 py-12">
        <h1 className="font-heading text-xl font-light">
          Workspace unavailable
        </h1>
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
        <Link
          className={buttonVariants({ className: "w-fit", variant: "outline" })}
          href="/drafts"
        >
          <ArrowLeft aria-hidden="true" />
          Back to drafts
        </Link>
      </CardContent>
    </Card>
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The draft workspace request could not be completed.";
}
