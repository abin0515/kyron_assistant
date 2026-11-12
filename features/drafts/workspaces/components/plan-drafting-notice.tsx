import { LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import type { CourseSetupGeneratorState } from "@/features/drafts/workspaces/hooks/use-course-setup-generator";

// The generator's own message when the server gives no reason.
const GENERIC_FAILURE = "The course setup could not be generated.";

// Above the plan: while the AI drafts it, when drafting failed, and whenever
// there is no plan yet (a reload mid-draft, or a draft from before the prompt
// box), so drafting is never hidden behind "Edit prompt and files".
export function PlanDraftingNotice({
  generatorState,
  needsPlan,
  onEditPrompt,
  onDraft,
}: {
  generatorState: CourseSetupGeneratorState;
  needsPlan: boolean;
  onEditPrompt: () => void;
  onDraft: () => void;
}) {
  if (generatorState.phase === "generating") {
    return (
      <div
        aria-live="polite"
        className="flex items-start gap-3 rounded-xl border border-primary/20 bg-accent/60 px-5 py-4"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
        <div className="grid gap-1">
          <p className="text-sm font-medium">Drafting your plan…</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The AI reads your prompt and files, drafts the outcome, audience and length, and QA checks them. This
            usually takes under a minute.
          </p>
        </div>
      </div>
    );
  }

  if (generatorState.phase === "error" && generatorState.errorMessage) {
    const reason = generatorState.errorMessage === GENERIC_FAILURE ? null : generatorState.errorMessage;

    return (
      <InlineNotice tone="error">
        <p className="font-medium">The plan could not be drafted.</p>
        <p>{reason ?? "Try again, or change the prompt and files first."}</p>
        <NoticeActions onEditPrompt={onEditPrompt} primary={{ label: "Try again", onClick: onDraft }} />
      </InlineNotice>
    );
  }

  if (needsPlan) {
    return (
      <InlineNotice tone="info">
        <p>The plan has not been drafted yet.</p>
        <NoticeActions onEditPrompt={onEditPrompt} primary={{ label: "Draft the plan", onClick: onDraft }} />
      </InlineNotice>
    );
  }

  return null;
}

// Under the message, so it keeps its width on phones.
function NoticeActions({
  onEditPrompt,
  primary,
}: {
  onEditPrompt: () => void;
  primary: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <Button onClick={primary.onClick} size="sm" type="button">
        <Sparkles aria-hidden="true" />
        {primary.label}
      </Button>
      <Button onClick={onEditPrompt} size="sm" type="button" variant="outline">
        Edit prompt and files
      </Button>
    </div>
  );
}
