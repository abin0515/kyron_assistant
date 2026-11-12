import type { DraftStatus, DraftWorkspace, QaRun } from "@/types/api";

export type CourseStepState = "done" | "current" | "upcoming" | "attention";

export type CourseStep = {
  key: "prompt" | "plan" | "template" | "review" | "video";
  label: string;
  state: CourseStepState;
  detail: string;
  href: string;
};

// Where a course stands in the flow: upload and prompt → plan → Kyron
// template → review and approve → video. The lesson run is optional (the
// workspace page does not load it); without it step 4 reads as next.
export function courseSteps({
  draftStatus,
  lessonRun,
  workspace,
}: {
  draftStatus: DraftStatus | null;
  // undefined: not loaded on this page (the workspace page); null: no run yet.
  lessonRun: Pick<QaRun, "stage" | "renderApproval" | "media"> | null | undefined;
  workspace: Pick<DraftWorkspace, "id" | "sourceText" | "courseSetupCalibration" | "kyronDraftId">;
}): CourseStep[] {
  const editor = `/drafts/${workspace.id}`;
  const review = `/drafts/${workspace.id}/review`;
  const prompted = Boolean(workspace.sourceText.trim()) || workspace.courseSetupCalibration !== null;
  const submitted = workspace.kyronDraftId !== null;
  const generated = draftStatus === "done";
  const approval = lessonRun?.renderApproval ?? null;
  const approved = approval?.status === "approved";
  const qaStopped = lessonRun?.stage === "blocked" || lessonRun?.stage === "error";
  const renderFailed = lessonRun?.media?.status === "failed" || (approved && qaStopped);

  return [
    {
      key: "prompt",
      label: "Upload & prompt",
      state: prompted || submitted ? "done" : "current",
      detail: prompted || submitted ? "Source and prompt added" : "Add a file and a prompt",
      href: editor,
    },
    {
      key: "plan",
      label: "Plan",
      state: submitted ? "done" : prompted ? "current" : "upcoming",
      detail: submitted ? "Plan sent to Kyron" : "Outcome, audience and length",
      href: editor,
    },
    {
      key: "template",
      label: "Template (Kyron)",
      state: !submitted ? "upcoming" : draftStatus === "error" ? "attention" : generated ? "done" : "current",
      detail: !submitted
        ? "Kyron generates it from the plan"
        : draftStatus === "error"
          ? "Kyron could not generate it"
          : generated
            ? "Generated"
            : "Kyron is generating",
      href: submitted ? review : editor,
    },
    {
      key: "review",
      label: "Review & approve",
      state: approved ? "done" : !generated ? "upcoming" : qaStopped ? "attention" : "current",
      detail: approved
        ? "Approved"
        : !generated
          ? "Check the template and the report"
          : lessonRun === undefined
            ? "Open the review page"
            : qaStopped
              ? "QA stopped; see the review page"
              : lessonRun?.stage === "awaiting_approval"
                ? "Ready for your review"
                : "QA is checking and fixing",
      href: review,
    },
    {
      key: "video",
      label: "Video",
      state: !approved
        ? "upcoming"
        : approval?.renderingOff || renderFailed
          ? "attention"
          : lessonRun?.media?.status === "checked"
            ? "done"
            : "current",
      detail: !approved
        ? "Renders after your approval"
        : approval?.renderingOff
          ? "Rendering is turned off"
          : renderFailed
            ? "The render did not finish"
            : lessonRun?.media?.status === "checked"
              ? "Rendered and checked"
              : "Rendering in Kyron",
      href: review,
    },
  ];
}
