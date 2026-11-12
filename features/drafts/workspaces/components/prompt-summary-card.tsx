"use client";

import { FileText, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getWorkspaceSourceFiles } from "@/features/drafts/workspaces/api";
import type { WorkspaceSourceFileItem } from "@/types/api";

// Focused when the editor closes, so keyboard users stay in step 1.
export const PROMPT_EDIT_BUTTON_ID = "edit-prompt-button";

// Step 1 once the draft was started from the prompt box: what was asked and
// which files came with it, with a way back to edit them.
export function PromptSummaryCard({
  editable,
  onEdit,
  sourceText,
  workspaceId,
}: {
  editable: boolean;
  onEdit: () => void;
  sourceText: string;
  workspaceId: string;
}) {
  const files = useLinkedFiles(workspaceId);
  const prompt = sourceText.trim();

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
          1
        </span>
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="text-base font-medium">Your prompt</h2>
            {editable ? (
              <Button
                className="-mr-2"
                id={PROMPT_EDIT_BUTTON_ID}
                onClick={onEdit}
                size="sm"
                type="button"
                variant="ghost"
              >
                <PencilLine aria-hidden="true" />
                Edit prompt and files
              </Button>
            ) : null}
          </div>
          <p className="line-clamp-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {prompt || (files.length > 0 ? "No prompt: the plan is drafted from the files." : "No prompt yet.")}
          </p>
          {files.length > 0 ? (
            <ul aria-label="Source files" className="flex flex-wrap gap-2">
              {files.map((file) => (
                <li
                  className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                  key={`${file.purpose}-${file.id}`}
                >
                  <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-56 truncate" title={file.name}>
                    {file.name}
                  </span>
                  {file.purpose === "kyron_attachment" ? (
                    <span className="text-muted-foreground">· sent to Kyron</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// The AI sources, plus the Kyron attachment when it is a different file.
function useLinkedFiles(workspaceId: string): WorkspaceSourceFileItem[] {
  const [files, setFiles] = useState<WorkspaceSourceFileItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    void getWorkspaceSourceFiles(workspaceId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setFiles(summaryFiles(response.files));
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [workspaceId]);

  return files;
}

function summaryFiles(files: WorkspaceSourceFileItem[]): WorkspaceSourceFileItem[] {
  const attachment = files.find((file) => file.purpose === "kyron_attachment");
  const aiFiles = files.filter((file) => file.purpose === "ai_input");

  return [
    ...aiFiles.map((file) => (attachment?.id === file.id ? attachment : file)),
    ...(attachment && !aiFiles.some((file) => file.id === attachment.id) ? [attachment] : []),
  ];
}
