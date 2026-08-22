"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/features/drafts/workspaces/api";
import type { DraftWorkspace } from "@/types/api";

export function WorkspaceEditor({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const submissionControllerRef = useRef<AbortController | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generated, setGenerated] = useState(false);
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
    setWorkspace(nextWorkspace);
    autosave.queueSave(nextWorkspace);
  }

  function handleSourceChange(sourceText: string) {
    if (!workspace) {
      return;
    }

    generator.reset();
    setGenerated(false);
    handleWorkspaceChange({ ...workspace, sourceText });
  }

  async function handleGenerate() {
    if (!workspace) {
      return;
    }

    const setup = await generator.generate(workspace.sourceText);

    if (setup) {
      setGenerated(true);
      handleWorkspaceChange({ ...workspace, ...setup });
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
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-4">
          <Link
            className={buttonVariants({
              className: "w-fit",
              size: "sm",
              variant: "outline",
            })}
            href="/drafts"
          >
            <ArrowLeft aria-hidden="true" />
            Back to drafts
          </Link>
          <div className="grid gap-1.5">
            <h1 className="font-heading text-[1.8rem] leading-tight font-light tracking-[-0.025em]">
              {workspace.name || "Untitled draft"}
            </h1>
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
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-6">
          <CourseSourceCard
            disabled={locked}
            generatorState={generator.state}
            onGenerate={() => void handleGenerate()}
            onSourceChange={handleSourceChange}
            sourceText={workspace.sourceText}
          />
          <WorkspaceForm
            disabled={locked || generator.state.phase === "generating"}
            fieldErrors={fieldErrors}
            generated={generated}
            onChange={handleWorkspaceChange}
            workspace={workspace}
          />
        </div>

        <WorkspaceStatusPanel
          autosaveState={autosave.state}
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
    <Card className="mx-auto max-w-2xl rounded-xl border-border ring-1 ring-border">
      <CardContent className="flex items-center gap-3 px-6 py-12 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Loading draft workspace…
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="mx-auto max-w-2xl rounded-xl border-border ring-1 ring-border">
      <CardContent className="grid gap-4 px-6 py-12">
        <h1 className="font-heading text-xl font-light">
          Workspace unavailable
        </h1>
        <p className="text-sm text-primary" role="alert">
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
