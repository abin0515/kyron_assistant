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
  hasGeneratedSetup,
  sourceText,
  workspaceId,
}: {
  disabled: boolean;
  generatorState: CourseSetupGeneratorState;
  onGenerate: () => void;
  onSourceChange: (value: string) => void;
  hasGeneratedSetup: boolean;
  sourceText: string;
  workspaceId: string;
}) {
  const generating = generatorState.phase === "generating";
  const [hasAiSourceFiles, setHasAiSourceFiles] = useState(false);
  const hasSourceInformation = Boolean(sourceText.trim()) || hasAiSourceFiles;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-border/80 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
            1
          </span>
          <div className="grid gap-1">
            <CardTitle className="text-base font-medium">
              Add source information
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Add a brief, transcript, or source files for the AI assistant.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5 sm:px-6 sm:py-6">
        <label className="grid gap-1.5" htmlFor="sourceText">
          <span className="text-sm font-semibold">Brief or transcript</span>
          <Textarea
            className="min-h-40"
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

        <div className="flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            AI uses the brief and selected source files to recommend the course setup.
          </p>
          <Button
            className="shrink-0"
            disabled={disabled || generating || !hasSourceInformation}
            onClick={onGenerate}
            type="button"
          >
            {generating ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                Generating and checking…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                {hasGeneratedSetup
                  ? "Regenerate course setup"
                  : "Generate course setup"}
              </>
            )}
          </Button>
        </div>

        {generatorState.errorMessage ? (
          <p className="text-xs text-destructive" role="alert">
            {generatorState.errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
