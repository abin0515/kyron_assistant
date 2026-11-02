import "server-only";

import type { QaLessonSnapshot } from "@/types/api";

import { nullableString, objectSchema, runStructuredModel } from "../model";
import { containsQuote } from "./lesson-text";
import { parseItems, readEnum, readString } from "./parsing";
import type { CheckDraft, EvaluationOutput, FindingDraft } from "./types";

const MAX_TRANSCRIPT_CHARACTERS = 120_000;

type Mismatch = {
  activityId: string | null;
  scriptQuote: string | null;
  transcriptQuote: string | null;
  problem: "missing" | "different_meaning" | "extra" | "misstated_term";
  severity: "critical" | "major" | "minor";
  explanation: string;
};

const SCHEMA = objectSchema({
  mismatches: {
    type: "array",
    items: objectSchema({
      activityId: nullableString,
      scriptQuote: nullableString,
      transcriptQuote: nullableString,
      problem: {
        type: "string",
        enum: ["missing", "different_meaning", "extra", "misstated_term"],
      },
      severity: { type: "string", enum: ["critical", "major", "minor"] },
      explanation: { type: "string" },
    }),
  },
});

const INSTRUCTIONS = `
Compare the speech transcript of a rendered lesson video with the approved narration script. Report places where the video leaves out instruction, says something with a different meaning, adds unscripted instruction, or misstates a technical term or number. Ignore filler words, small rewording and transcription noise.

Quote the script and the transcript exactly where possible. Use "critical" when the spoken content teaches something false, "major" for missing or changed instruction, and "minor" for small slips.
`.trim();

// Compares a transcript of the rendered video with the snapshot's narration.
export async function evaluateNarrationMatch(
  snapshot: QaLessonSnapshot,
  transcript: string,
): Promise<EvaluationOutput> {
  const narrated = snapshot.activities.filter((activity) => activity.narration);

  if (narrated.length === 0) {
    return {
      checks: [check("not_tested", "The lesson has no narration to compare with the video.")],
      findings: [],
      usage: [],
    };
  }

  if (!transcript.trim()) {
    return {
      checks: [check("fail", "The video has no recognizable speech.")],
      findings: [
        {
          criterionId: "media.narration-match",
          evaluator: "media",
          activityId: null,
          fieldPath: null,
          severity: "major",
          observedText: null,
          expectedBehavior: "The video speaks the approved narration.",
          rationale: "Transcription returned no speech.",
          evidence: [{ kind: "transcript", label: "Transcript", quote: "(empty)" }],
          retest: "Regenerate or replace the video, then check the narration again.",
        },
      ],
      usage: [],
    };
  }

  const script = narrated
    .map((activity) => `[ACTIVITY id=${activity.id}]\n${activity.narration}`)
    .join("\n\n");
  const { value: mismatches, usage } = await runStructuredModel({
    purpose: "qa.media.narration",
    schemaName: "narration_mismatches",
    schema: SCHEMA,
    instructions: INSTRUCTIONS,
    input: [
      `<<<APPROVED NARRATION (untrusted)\n${script}\nNARRATION END>>>`,
      `<<<VIDEO TRANSCRIPT (untrusted)\n${transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS)}\nTRANSCRIPT END>>>`,
    ].join("\n\n"),
    parse: (value) => parseItems(value, "mismatches", parseMismatch),
  });
  const verified = mismatches.filter(
    (mismatch) =>
      (!mismatch.scriptQuote || containsQuote(script, mismatch.scriptQuote)) &&
      (!mismatch.transcriptQuote || containsQuote(transcript, mismatch.transcriptQuote)),
  );
  const serious = verified.filter((mismatch) => mismatch.severity !== "minor");

  return {
    checks: [
      serious.length > 0
        ? check("fail", `${serious.length} place(s) where the video differs from the script.`)
        : check("pass", "The video's speech matches the narration."),
    ],
    findings: verified.map(mismatchFinding),
    usage: [usage],
  };
}

function mismatchFinding(mismatch: Mismatch): FindingDraft {
  return {
    criterionId: "media.narration-match",
    evaluator: "media",
    activityId: mismatch.activityId,
    // The fix is regenerating the clip, not editing text, so no field path.
    fieldPath: null,
    severity: mismatch.severity,
    observedText: mismatch.transcriptQuote,
    expectedBehavior: mismatch.scriptQuote
      ? `Speak the approved narration: "${mismatch.scriptQuote}"`
      : "Speak only the approved narration.",
    rationale: mismatch.explanation,
    evidence: [
      ...(mismatch.scriptQuote
        ? [{ kind: "lesson" as const, label: "Approved narration", quote: mismatch.scriptQuote }]
        : []),
      ...(mismatch.transcriptQuote
        ? [{ kind: "transcript" as const, label: "Video transcript", quote: mismatch.transcriptQuote }]
        : []),
    ],
    retest: "Regenerate the affected clip, then compare its speech with the narration again.",
  };
}

function check(status: CheckDraft["status"], summary: string): CheckDraft {
  return {
    criterionId: "media.narration-match",
    evaluator: "media",
    activityId: null,
    status,
    summary,
  };
}

function parseMismatch(record: Record<string, unknown>): Mismatch | null {
  const problem = readEnum(record, "problem", [
    "missing",
    "different_meaning",
    "extra",
    "misstated_term",
  ] as const);
  const severity = readEnum(record, "severity", ["critical", "major", "minor"] as const);
  const explanation = readString(record, "explanation");

  return problem && severity && explanation
    ? {
        activityId: readString(record, "activityId"),
        scriptQuote: readString(record, "scriptQuote"),
        transcriptQuote: readString(record, "transcriptQuote"),
        problem,
        severity,
        explanation,
      }
    : null;
}
