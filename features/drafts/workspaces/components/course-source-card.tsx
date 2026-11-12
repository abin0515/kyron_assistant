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
  onAttachmentLinked,
  onClose,
  onGenerate,
  onSourceChange,
  hasGeneratedSetup,
  sourceText,
  workspaceId,
}: {
  disabled: boolean;
  generatorState: CourseSetupGeneratorState;
  onAttachmentLinked: () => void;
  // Back to the prompt summary; changes are already saved.
  onClose?: () => void;
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
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/80 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
            1
          </span>
          <div className="grid gap-1">
            <CardTitle className="text-base font-medium">
              Upload and prompt
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Upload the source file and describe what the course should be.
            </p>
          </div>
        </div>
        {onClose ? (
          <Button
            className="-mr-2 shrink-0"
            disabled={generating}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            Done
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5 sm:px-6 sm:py-6">
        <label className="grid gap-1.5" htmlFor="sourceText">
          <span className="text-sm font-semibold">Generation prompt</span>
          <Textarea
            className="min-h-40"
            disabled={disabled || generating}
            id="sourceText"
            maxLength={COURSE_BRIEF_MAX_LENGTH}
            onChange={(event) => onSourceChange(event.currentTarget.value)}
            placeholder="What should this course teach, to whom, and how long should it be? You can also paste notes or a transcript…"
            value={sourceText}
          />
          <span className="text-xs text-muted-foreground">
            The prompt and files steer the plan in step 2. Kyron then generates
            the template from that plan and the attached file.
          </span>
        </label>

        <WorkspaceSourceFiles
          disabled={disabled || generating}
          onAiSourceFilesChange={setHasAiSourceFiles}
          onAttachmentLinked={onAttachmentLinked}
          workspaceId={workspaceId}
        />

        <div className="flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            AI uses the prompt and files to draft the plan: outcome, audience and length.
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
                {hasGeneratedSetup ? "Regenerate the plan" : "Generate the plan"}
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
