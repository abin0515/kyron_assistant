"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import {
  createDraftWorkspace,
  updateDraftWorkspace,
  updateWorkspaceSourceFiles,
} from "@/features/drafts/workspaces/api";
import { PromptComposer } from "@/features/drafts/workspaces/components/prompt-composer";
import { usePromptFiles } from "@/features/drafts/workspaces/hooks/use-prompt-files";
import { linkPromptFiles } from "@/features/drafts/workspaces/prompt-files";
import { cn } from "@/lib/utils";

type StartPhase = "idle" | "creating" | "saving" | "linking" | "opening";

const PHASE_LABELS: Record<Exclude<StartPhase, "idle">, string> = {
  creating: "Creating the draft…",
  saving: "Saving your prompt…",
  linking: "Adding your files…",
  opening: "Opening the plan…",
};

const EXAMPLE_PROMPTS = [
  "Turn the attached lecture into a short lesson for working engineers.",
  "A 30-minute course on project risk management for new team leads.",
  "Practice activities on Python data types for adult beginners.",
];

// A new draft starts as one prompt box. Sending it creates the draft, saves
// the prompt, links the files and opens the plan, which is drafted there.
export function NewDraftWorkspace() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Kept after a failed step, so trying again does not create a second draft.
  const workspaceIdRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<StartPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const promptFiles = usePromptFiles();
  const busy = phase !== "idle";
  const dragging = useFileDrop((files) => promptFiles.add(files), busy || promptFiles.full);

  const readableFiles = promptFiles.readyFiles.filter((file) => file.aiReadable);
  const hasInput = Boolean(prompt.trim()) || readableFiles.length > 0;
  const canSubmit = hasInput && !promptFiles.uploading;
  const blockedReason = promptFiles.uploading
    ? "Waiting for files to finish uploading…"
    : !hasInput && promptFiles.readyFiles.length > 0
      ? "Add a prompt: these files are too large for the AI to read."
      : null;

  async function handleStart() {
    if (busy || !canSubmit) {
      return;
    }

    setErrorMessage(null);

    try {
      setPhase("creating");
      const retrying = workspaceIdRef.current !== null;
      const workspaceId = workspaceIdRef.current ?? (await createDraftWorkspace()).id;
      workspaceIdRef.current = workspaceId;

      setPhase("saving");
      await updateDraftWorkspace(workspaceId, { sourceText: prompt.trim() });

      if (promptFiles.readyFiles.length > 0 || retrying) {
        setPhase("linking");
        await linkPromptFiles(workspaceId, promptFiles.readyFiles, updateWorkspaceSourceFiles);
      }

      setPhase("opening");
      router.push(`/drafts/${workspaceId}?generate=plan`);
    } catch (error) {
      setPhase("idle");
      setErrorMessage(error instanceof Error ? error.message : "The draft could not be started.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-3xl flex-col justify-center gap-8 py-10">
      <div className="grid gap-3 text-center">
        <h1 className="font-heading text-3xl font-light tracking-tight text-balance sm:text-4xl">
          What should this course teach?
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
          Describe the course and add your source files. You&apos;ll review the plan next, before Kyron builds anything.
        </p>
      </div>

      <div className="grid gap-3">
        <PromptComposer
          blockedReason={blockedReason}
          busy={busy}
          canSubmit={canSubmit}
          dragging={dragging}
          files={promptFiles.files}
          filesFull={promptFiles.full}
          onAddFiles={promptFiles.add}
          onChange={(value) => {
            setPrompt(value);
            setErrorMessage(null);
          }}
          onRemoveFile={promptFiles.remove}
          onRetryFile={(key) => void promptFiles.retry(key)}
          onSubmit={() => void handleStart()}
          textareaRef={textareaRef}
          value={prompt}
        />
        <p aria-live="polite" className="min-h-5 px-1 text-sm text-muted-foreground">
          {busy ? PHASE_LABELS[phase as Exclude<StartPhase, "idle">] : (promptFiles.notice ?? "")}
        </p>
        {errorMessage ? (
          <InlineNotice tone="error">
            <span>{errorMessage}</span>{" "}
            <Button className="mt-2 sm:mt-0 sm:ml-2" onClick={() => void handleStart()} size="xs" type="button" variant="outline">
              Try again
            </Button>
          </InlineNotice>
        ) : null}
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          PDF, PowerPoint or Word, up to 10 files. The AI reads files up to 50 MB; the first PDF or PowerPoint (up to
          250 MB) is also sent to Kyron as the course material.
        </p>
      </div>

      <ExamplePrompts
        disabled={busy}
        hidden={Boolean(prompt.trim())}
        onPick={(example) => {
          setPrompt(example);
          setErrorMessage(null);
          textareaRef.current?.focus();
        }}
      />
    </div>
  );
}

// Files dropped anywhere on the page are added; without this the browser
// would open a file dropped beside the box and lose the prompt.
function useFileDrop(onDrop: (files: File[]) => void, ignore: boolean): boolean {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  const ignoreRef = useRef(ignore);

  useEffect(() => {
    onDropRef.current = onDrop;
    ignoreRef.current = ignore;
  });

  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));

    function handleEnter(event: DragEvent) {
      if (carriesFiles(event)) {
        depth += 1;
        setDragging(true);
      }
    }

    function handleLeave(event: DragEvent) {
      if (carriesFiles(event)) {
        depth = Math.max(0, depth - 1);
        setDragging(depth > 0);
      }
    }

    function handleOver(event: DragEvent) {
      if (carriesFiles(event)) {
        event.preventDefault();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = ignoreRef.current ? "none" : "copy";
        }
      }
    }

    function handleDrop(event: DragEvent) {
      if (!carriesFiles(event)) {
        return;
      }

      event.preventDefault();
      depth = 0;
      setDragging(false);

      if (!ignoreRef.current && event.dataTransfer && event.dataTransfer.files.length > 0) {
        onDropRef.current(Array.from(event.dataTransfer.files));
      }
    }

    window.addEventListener("dragenter", handleEnter);
    window.addEventListener("dragleave", handleLeave);
    window.addEventListener("dragover", handleOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleEnter);
      window.removeEventListener("dragleave", handleLeave);
      window.removeEventListener("dragover", handleOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return dragging;
}

// Shown only while the box is empty, so picking one never replaces typed
// text; the space is kept so the box does not jump.
function ExamplePrompts({
  disabled,
  hidden,
  onPick,
}: {
  disabled: boolean;
  hidden: boolean;
  onPick: (example: string) => void;
}) {
  return (
    <div aria-hidden={hidden} className={cn("grid gap-3 transition-opacity", hidden && "invisible opacity-0")} inert={hidden}>
      <p className="text-center text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Try an example</p>
      <ul className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_PROMPTS.map((example) => (
          <li key={example}>
            <button
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-left text-sm text-foreground shadow-xs transition-colors hover:border-foreground/20 hover:bg-muted/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-50"
              disabled={disabled}
              onClick={() => onPick(example)}
              type="button"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
