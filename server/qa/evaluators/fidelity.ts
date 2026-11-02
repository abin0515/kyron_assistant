import "server-only";

import type { QaActivity, QaReference } from "@/types/api";

import { nullableString, objectSchema, runStructuredModel } from "../model";
import { containsQuote, renderLesson, selectActivities } from "./lesson-text";
import {
  activityContainsQuote,
  FIELD_PATH_SCHEMA,
  parseItems,
  readEnum,
  readString,
} from "./parsing";
import type {
  CheckDraft,
  EvaluationInput,
  EvaluationOutput,
  FindingDraft,
} from "./types";

const MAX_REFERENCE_CHARACTERS = 150_000;

type Claim = {
  activityId: string;
  fieldPath: string;
  claimQuote: string;
  importance: "core" | "supporting";
  verdict: "supported" | "contradicted" | "insufficient";
  referenceTitle: string | null;
  referenceQuote: string | null;
  explanation: string;
};

const SCHEMA = objectSchema({
  claims: {
    type: "array",
    items: objectSchema({
      activityId: { type: "string" },
      fieldPath: FIELD_PATH_SCHEMA,
      claimQuote: { type: "string" },
      importance: { type: "string", enum: ["core", "supporting"] },
      verdict: { type: "string", enum: ["supported", "contradicted", "insufficient"] },
      referenceTitle: nullableString,
      referenceQuote: nullableString,
      explanation: { type: "string" },
    }),
  },
});

const INSTRUCTIONS = `
You verify a generated lesson against approved reference material.

Extract the material claims the lesson teaches: facts, definitions, generalizations, worked examples and explanations in answer rationales. Skip greetings and navigation. For each claim, quote the lesson exactly (claimQuote) and decide:
- "supported": a reference passage states or directly implies it; quote that passage exactly in referenceQuote.
- "contradicted": a reference passage says otherwise; quote it exactly.
- "insufficient": the references neither support nor contradict it; use null for the reference fields.

Mark claims central to what the activity teaches as "core". Judge only against the references, not against what seems plausible.
`.trim();

export async function evaluateFidelity({
  activityIds,
  snapshot,
}: EvaluationInput): Promise<EvaluationOutput> {
  const activities = selectActivities(snapshot, activityIds);

  if (snapshot.references.length === 0) {
    return {
      checks: activities.map((activity) =>
        check(activity.id, "not_tested", "No approved references were supplied."),
      ),
      findings: [],
      usage: [],
    };
  }

  const { truncated, text: referenceText } = renderReferences(snapshot.references);
  const { value: claims, usage } = await runStructuredModel({
    purpose: "qa.fidelity",
    schemaName: "claim_verification",
    schema: SCHEMA,
    instructions: INSTRUCTIONS,
    input: [
      referenceText,
      renderLesson(snapshot, { includeAnswerKeys: true, activityIds }),
    ].join("\n\n"),
    parse: (value) => parseItems(value, "claims", parseClaim),
  });
  const verified = claims.flatMap((claim) => {
    const activity = activities.find((candidate) => candidate.id === claim.activityId);

    if (!activity || !activityContainsQuote(activity, claim.fieldPath, claim.claimQuote)) {
      return [];
    }

    // A contradiction only counts when the cited reference text really exists.
    return [
      claim.verdict === "contradicted" &&
      !referenceContains(snapshot.references, claim.referenceTitle, claim.referenceQuote)
        ? { ...claim, verdict: "insufficient" as const }
        : claim,
    ];
  });

  return {
    checks: activities.map((activity) => activityCheck(activity, verified, truncated)),
    findings: verified.flatMap(claimFinding),
    usage: [usage],
  };
}

function activityCheck(activity: QaActivity, claims: Claim[], truncated: boolean): CheckDraft {
  const own = claims.filter((claim) => claim.activityId === activity.id);
  const contradicted = own.filter((claim) => claim.verdict === "contradicted");
  const unsupportedCore = own.filter(
    (claim) => claim.verdict === "insufficient" && claim.importance === "core",
  );
  const note = truncated ? " References were truncated for length." : "";

  if (contradicted.length > 0) {
    return check(activity.id, "fail", `${contradicted.length} claim(s) contradict the references.${note}`);
  }

  if (unsupportedCore.length > 0) {
    return check(activity.id, "needs_review", `${unsupportedCore.length} core claim(s) have no supporting reference.${note}`);
  }

  return check(activity.id, "pass", `${own.length} claim(s) checked against the references.${note}`);
}

function claimFinding(claim: Claim): FindingDraft[] {
  if (claim.verdict === "supported" || (claim.verdict === "insufficient" && claim.importance !== "core")) {
    return [];
  }

  const contradicted = claim.verdict === "contradicted";

  return [
    {
      criterionId: "accuracy.claims-supported",
      evaluator: "fidelity",
      activityId: claim.activityId,
      fieldPath: claim.fieldPath,
      severity: contradicted ? (claim.importance === "core" ? "critical" : "major") : "minor",
      observedText: claim.claimQuote,
      expectedBehavior: contradicted
        ? "The claim agrees with the approved reference."
        : "Core claims are backed by an approved reference.",
      rationale: claim.explanation,
      evidence: [
        { kind: "lesson", label: claim.fieldPath, quote: claim.claimQuote },
        ...(contradicted && claim.referenceQuote
          ? [{ kind: "reference" as const, label: claim.referenceTitle ?? "Reference", quote: claim.referenceQuote }]
          : []),
      ],
      retest: "Re-check the changed claim against the references, then re-check cross-field consistency.",
    },
  ];
}

function renderReferences(references: QaReference[]): { text: string; truncated: boolean } {
  let remaining = MAX_REFERENCE_CHARACTERS;
  let truncated = false;
  const parts = references.map((reference) => {
    const text = reference.text.slice(0, Math.max(remaining, 0));

    truncated ||= text.length < reference.text.length;
    remaining -= text.length;

    return `[REFERENCE: ${reference.title}]\n${text}`;
  });

  return {
    text: ["<<<APPROVED REFERENCES (untrusted)", ...parts, "REFERENCES END>>>"].join("\n\n"),
    truncated,
  };
}

function referenceContains(
  references: QaReference[],
  title: string | null,
  quote: string | null,
): boolean {
  if (!quote) {
    return false;
  }

  const candidates = references.filter((reference) => !title || reference.title === title);

  return (candidates.length > 0 ? candidates : references).some((reference) =>
    containsQuote(reference.text, quote),
  );
}

function check(activityId: string, status: CheckDraft["status"], summary: string): CheckDraft {
  return {
    criterionId: "accuracy.claims-supported",
    evaluator: "fidelity",
    activityId,
    status,
    summary,
  };
}

function parseClaim(record: Record<string, unknown>): Claim | null {
  const activityId = readString(record, "activityId");
  const fieldPath = readString(record, "fieldPath");
  const claimQuote = readString(record, "claimQuote");
  const importance = readEnum(record, "importance", ["core", "supporting"] as const);
  const verdict = readEnum(record, "verdict", ["supported", "contradicted", "insufficient"] as const);
  const explanation = readString(record, "explanation");

  return activityId && fieldPath && claimQuote && importance && verdict && explanation !== null
    ? {
        activityId,
        fieldPath,
        claimQuote,
        importance,
        verdict,
        explanation,
        referenceTitle: readString(record, "referenceTitle"),
        referenceQuote: readString(record, "referenceQuote"),
      }
    : null;
}
