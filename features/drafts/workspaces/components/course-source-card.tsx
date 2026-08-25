import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceSourceFiles } from "@/features/drafts/workspaces/components/workspace-source-files";
import type { CourseSetupGeneratorState } from "@/features/drafts/workspaces/hooks/use-course-setup-generator";
import { COURSE_BRIEF_MAX_LENGTH } from "@/types/api";

export function CourseSourceCard({
  disabled,
  generatorState,
  onGenerate,
  onSourceChange,
  sourceText,
  workspaceId,
}: {
  disabled: boolean;
  generatorState: CourseSetupGeneratorState;
  onGenerate: () => void;
  onSourceChange: (value: string) => void;
  sourceText: string;
  workspaceId: string;
}) {
  const generating = generatorState.phase === "generating";
  const [hasAiSourceFiles, setHasAiSourceFiles] = useState(false);
  const hasSourceInformation = Boolean(sourceText.trim()) || hasAiSourceFiles;

  return (
    <Card className="gap-0 rounded-xl border-border py-0 ring-1 ring-border">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="text-base font-light">
          1. Add source information
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add a brief, transcript, or source files for the AI assistant.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5">
        <label className="grid gap-1.5" htmlFor="sourceText">
          <span className="text-sm font-semibold">Brief or transcript</span>
          <Textarea
            className="min-h-40 rounded-lg bg-card"
            disabled={disabled || generating}
            id="sourceText"
            maxLength={COURSE_BRIEF_MAX_LENGTH}
            onChange={(event) => onSourceChange(event.currentTarget.value)}
            placeholder="Describe the topic, audience, learning goal, and preferred length…"
            value={sourceText}
          />
          <span className="text-xs text-muted-foreground">
            Include the topic, intended audience, desired outcome, and any time
            constraints. You may also paste a transcript.
          </span>
        </label>

        <WorkspaceSourceFiles
          disabled={disabled || generating}
          onAiSourceFilesChange={setHasAiSourceFiles}
          workspaceId={workspaceId}
        />

        <Button
          className="min-h-10 w-fit px-4 font-semibold"
          disabled={disabled || generating || !hasSourceInformation}
          onClick={onGenerate}
          type="button"
        >
          {generating ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles aria-hidden="true" />
              Generate course setup
            </>
          )}
        </Button>

        {generatorState.errorMessage ? (
          <p className="text-xs text-primary" role="alert">
            {generatorState.errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
