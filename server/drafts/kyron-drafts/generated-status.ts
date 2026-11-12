import type { Draft } from "@/types/api";

// Kyron's draft status covers all of its later work too: one video that fails
// to render turns the whole draft to "error", and a render can show "started".
// Once QA has checked the generated template from Kyron, the template stays
// generated. Kyron's message is kept, worded as Kyron's report, because a
// render started outside QA (in Kyron Studio) is reported nowhere else.
export function keepGeneratedStatus(draft: Draft, templateChecked: boolean): Draft {
  if (!templateChecked || draft.status === "done") {
    return draft;
  }

  const reported = draft.statusMessage.trim();

  return { ...draft, status: "done", statusMessage: reported ? `Template generated. Kyron reports: ${reported}` : "" };
}
