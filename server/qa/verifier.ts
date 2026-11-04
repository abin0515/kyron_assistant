import "server-only";

import type { QaFinding, QaLessonSnapshot } from "@/types/api";

import { MAX_SETUP_REFERENCE_CHARACTERS, renderReferences } from "./evaluators/lesson-text";
import { parseItems, readEnum, readString } from "./evaluators/parsing";
import type { UsageRecord } from "./evaluators/types";
import { objectSchema, qaModel, runStructuredModel } from "./model";
import type { AppliedChange } from "./types";

export const VERIFIER_NAME = "QA verifier";

const VERDICTS = ["resolves", "partial", "does_not_resolve", "introduces_error"] as const;

export type VerifierVerdict = {
  index: number;
  verdict: (typeof VERDICTS)[number];
  explanation: string;
};

const INSTRUCTIONS = `
You independently review edits that another agent made to course content to fix quality findings. You did not make these edits and must not assume they are right.

For each change, judge only from the source material and the finding:
- "resolves": the new text fixes the problem and is accurate.
- "partial": better, but part of the problem remains.
- "does_not_resolve": the problem is still there.
- "introduces_error": the new text states something false, unsupported by the source material, or contradicts the rest of the change's context.

Explain each verdict in one or two sentences a reviewer can check.
`.trim();

// A second, independent pass over applied fixes: fresh context, different
// instructions and higher reasoning effort than the agent that wrote them.
export async function verifyChanges({
  changes,
  findings,
  snapshot,
}: {
  changes: AppliedChange[];
  findings: QaFinding[];
  snapshot: QaLessonSnapshot;
}): Promise<{ verdicts: VerifierVerdict[]; usage: UsageRecord }> {
  const ids = changes.map((_, index) => `C${index + 1}`);
  const { value, usage } = await runStructuredModel({
    purpose: "qa.verify",
    model: qaModel(),
    effort: "high",
    schemaName: "fix_verification",
    schema: objectSchema({
      verdicts: {
        type: "array",
        items: objectSchema({
          changeId: { type: "string", enum: ids },
          verdict: { type: "string", enum: [...VERDICTS] },
          explanation: { type: "string" },
        }),
      },
    }),
    instructions: INSTRUCTIONS,
    input: [
      `CHANGES TO REVIEW:\n${changes.map((change, index) => renderChange(ids[index], change, findings)).join("\n\n")}`,
      snapshot.references.length > 0
        ? renderReferences(snapshot.references, MAX_SETUP_REFERENCE_CHARACTERS)
        : "SOURCE MATERIAL: none was provided.",
    ].join("\n\n"),
    parse: (output) =>
      parseItems(output, "verdicts", (record) => {
        const index = ids.indexOf(readString(record, "changeId") ?? "");
        const verdict = readEnum(record, "verdict", VERDICTS);

        return index >= 0 && verdict ? { index, verdict, explanation: readString(record, "explanation") ?? "" } : null;
      }),
  });

  return { verdicts: value, usage };
}

function renderChange(id: string, change: AppliedChange, findings: QaFinding[]): string {
  const problems = findings
    .filter((finding) => change.findingIds.includes(finding.id))
    .map((finding) => `  Problem (${finding.criterionId}): ${finding.rationale} Expected: ${finding.expectedBehavior}`);

  return [
    `${id} ${change.activityId ? `activity ${change.activityId}, ` : ""}${change.fieldPath}`,
    ...problems,
    `  <<<BEFORE (untrusted)\n${change.before ?? "(empty)"}\n  BEFORE END>>>`,
    `  <<<AFTER (untrusted)\n${change.after}\n  AFTER END>>>`,
  ].join("\n");
}
