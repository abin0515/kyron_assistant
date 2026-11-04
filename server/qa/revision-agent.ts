import "server-only";

import type {
  QaActivity,
  QaFinding,
  QaLessonSnapshot,
  QaPatchProposal,
  QaRunTarget,
} from "@/types/api";

import { isSetupFieldPath, readSetupField, setupFieldUpdate } from "./course-setup-fields";
import {
  MAX_SETUP_REFERENCE_CHARACTERS,
  renderActivity,
  renderReferences,
  renderSetup,
} from "./evaluators/lesson-text";
import { parseItems, readString, readStrings } from "./evaluators/parsing";
import type { UsageRecord } from "./evaluators/types";
import { nullableString, objectSchema, revisionModel, runStructuredModel } from "./model";
import { criterionById } from "./rubrics";
import {
  activityFieldPaths,
  isProtectedField,
  LESSON_FIELD_PATHS,
  MAX_FIELD_LENGTH,
  readActivityField,
  readLessonField,
} from "./snapshot";

export const REVISION_AGENT_NAME = "QA revision agent";
export const REVISION_PURPOSE = "qa.revision";

// One field change the agent proposes, linked to the findings it resolves.
export type Revision = QaPatchProposal & { findingIds: string[] };

export type RevisionResult = {
  revisions: Revision[];
  unresolved: Array<{ findingId: string; reason: string }>;
  usage: UsageRecord | null;
  model: string;
};

// What the model returned, before the server checks it.
export type RawRevision = {
  findingIds: string[];
  activityId: string | null;
  fieldPath: string;
  newValue: string;
  rationale: string;
};

type RevisionContext = {
  snapshot: QaLessonSnapshot;
  target: QaRunTarget;
  findings: QaFinding[];
  allowedFields: Set<string>;
};

const INSTRUCTIONS = `
You revise course content so that it resolves the QA findings listed. You are the correction step of an automated course production pipeline, and your changes are applied without further review unless they are high risk.

- Resolve every finding you can with the smallest change that fixes it, keeping the author's voice, length and intent. Do not rewrite anything no finding asks about.
- Only change fields listed under EDITABLE FIELDS. Return the complete new value of each field you change, once per field, and list every finding that change resolves in findingIds.
- Stay faithful to the source material and never add claims it does not support.
- Keep related fields consistent with each other, for example the objective and the description, or narration and on-screen text.
- Course setup durations are 480, 900, 1800 or 3600 seconds; asset types are lesson, practice or scenario. For question.answerKey, return the correct option ids separated by commas.
- Kyron lessons are edited scene by scene: change scenes.<id>.narration (what the avatar says), scenes.<id>.onScreenText or scenes.<id>.title, not the joined narration. A conversation's question also appears in its question_video scene; keep them consistent.
- lesson.* fields change the whole lesson; propose them only when a finding is about the lesson itself.
- If a finding cannot be resolved by changing the editable fields, list it under unresolved with a short reason instead of guessing.
`.trim();

// Asks the revision model for one coherent set of changes that resolves the
// findings together. The server validates every change before it is used.
export async function reviseContent({
  findings,
  lockedFields = [],
  snapshot,
  target,
}: {
  findings: QaFinding[];
  lockedFields?: string[];
  snapshot: QaLessonSnapshot;
  target: QaRunTarget;
}): Promise<RevisionResult> {
  const shortIds = new Map(findings.map((finding, index) => [`F${index + 1}`, finding]));
  const locked = new Set(lockedFields);
  const allowedFields = new Set(
    editableFields(snapshot, target, findings).filter((key) => !locked.has(key)),
  );
  const model = revisionModel();

  if (allowedFields.size === 0) {
    return {
      revisions: [],
      unresolved: findings.map((finding) => ({
        findingId: finding.id,
        reason: "The finding does not name a field the agent may change.",
      })),
      usage: null,
      model,
    };
  }

  const { value, usage } = await runStructuredModel({
    purpose: REVISION_PURPOSE,
    model,
    schemaName: "content_revision",
    schema: schemaFor([...shortIds.keys()], allowedFieldPaths(allowedFields)),
    instructions: INSTRUCTIONS,
    input: [
      `CONTENT: ${target === "course_setup" ? "course setup (before lesson generation)" : "generated lesson"}`,
      `FINDINGS TO RESOLVE:\n${[...shortIds].map(([id, finding]) => renderFinding(id, finding)).join("\n\n")}`,
      `EDITABLE FIELDS:\n${renderEditableFields(allowedFields)}`,
      target === "course_setup"
        ? renderSetup(snapshot)
        : renderLessonForRevision(snapshot),
      snapshot.references.length > 0
        ? renderReferences(snapshot.references, MAX_SETUP_REFERENCE_CHARACTERS)
        : "SOURCE MATERIAL: none was provided.",
    ].join("\n\n"),
    parse: parseRevisionOutput,
  });
  const resolve = (ids: string[]) =>
    ids.flatMap((id) => {
      const finding = shortIds.get(id);

      return finding ? [finding.id] : [];
    });
  const { revisions, rejected } = validateRevisions(
    value.revisions.map((revision) => ({ ...revision, findingIds: resolve(revision.findingIds) })),
    { snapshot, target, findings, allowedFields },
  );
  const reported = [
    ...value.unresolved.flatMap((item) =>
      resolve([item.findingId]).map((findingId) => ({ findingId, reason: item.reason })),
    ),
    ...rejected.flatMap((item) =>
      item.findingIds.map((findingId) => ({
        findingId,
        reason: `The agent's revision was rejected: ${item.reason}`,
      })),
    ),
  ];
  // One reason per finding; the agent's own explanation comes first.
  const unresolved = reported.filter(
    (item, index) => reported.findIndex((other) => other.findingId === item.findingId) === index,
  );

  return { revisions, unresolved, usage, model };
}

// Keeps only changes that target allowed fields with valid, new values.
export function validateRevisions(
  raw: RawRevision[],
  { allowedFields, findings, snapshot, target }: RevisionContext,
): { revisions: Revision[]; rejected: Array<{ findingIds: string[]; reason: string }> } {
  const revisions: Revision[] = [];
  const rejected: Array<{ findingIds: string[]; reason: string }> = [];
  const seen = new Set<string>();
  const knownFindings = new Set(findings.map((finding) => finding.id));

  for (const item of raw) {
    const findingIds = [...new Set(item.findingIds)].filter((id) => knownFindings.has(id));
    const activityId = target === "course_setup" ? null : item.activityId;
    const key = fieldKey(activityId, item.fieldPath);
    const reject = (reason: string) => rejected.push({ findingIds, reason });

    if (findingIds.length === 0) {
      continue;
    }

    if (!allowedFields.has(key)) {
      reject(`${describeField(activityId, item.fieldPath)} is not an editable field.`);
      continue;
    }

    if (seen.has(key)) {
      reject(`${describeField(activityId, item.fieldPath)} was revised more than once.`);
      continue;
    }

    const activity = activityId ? snapshot.activities.find((candidate) => candidate.id === activityId) : null;
    const currentValue = currentFieldValue(snapshot, target, activity ?? null, item.fieldPath);
    const proposedValue = item.newValue.trim();
    const problem = valueProblem({ activity: activity ?? null, currentValue, fieldPath: item.fieldPath, proposedValue });

    if (problem) {
      reject(problem);
      continue;
    }

    seen.add(key);
    revisions.push({
      findingIds,
      activityId,
      fieldPath: item.fieldPath,
      currentValue: currentValue ?? "",
      proposedValue,
      rationale: item.rationale,
      protectedField: isProtectedField(item.fieldPath),
    });
  }

  return { revisions, rejected };
}

// Setup findings may change the field they name. Lesson findings may change
// the writable fields of their activity, scenes and vocabulary included;
// answer keys only when a finding is about the answer key. Lesson-wide
// findings may propose lesson settings, which always need approval.
export function editableFields(
  snapshot: QaLessonSnapshot,
  target: QaRunTarget,
  findings: QaFinding[],
): string[] {
  const keys = new Set<string>();

  for (const finding of findings) {
    if (target === "course_setup") {
      if (finding.fieldPath && isSetupFieldPath(finding.fieldPath)) {
        keys.add(fieldKey(null, finding.fieldPath));
      }

      continue;
    }

    if (finding.activityId === null) {
      for (const fieldPath of LESSON_FIELD_PATHS) {
        if (readLessonField(snapshot.lesson, fieldPath) !== null) {
          keys.add(fieldKey(null, fieldPath));
        }
      }

      continue;
    }

    const activity = snapshot.activities.find((candidate) => candidate.id === finding.activityId);

    for (const fieldPath of activity ? activityFieldPaths(activity) : []) {
      if (fieldPath !== "question.answerKey" || fieldPath === finding.fieldPath) {
        keys.add(fieldKey(finding.activityId, fieldPath));
      }
    }
  }

  return [...keys];
}

export function fieldKey(activityId: string | null, fieldPath: string): string {
  return `${activityId ?? ""}::${fieldPath}`;
}

function currentFieldValue(
  snapshot: QaLessonSnapshot,
  target: QaRunTarget,
  activity: QaActivity | null,
  fieldPath: string,
): string | null {
  if (target === "course_setup") {
    return isSetupFieldPath(fieldPath) ? readSetupField(snapshot.lesson, fieldPath) ?? "" : null;
  }

  if (activity) {
    return readActivityField(activity, fieldPath);
  }

  return fieldPath.startsWith("lesson.") ? readLessonField(snapshot.lesson, fieldPath) : null;
}

function renderLessonForRevision(snapshot: QaLessonSnapshot): string {
  return [
    "<<<LESSON CONTENT (untrusted)",
    ...LESSON_FIELD_PATHS.map((fieldPath) => `${fieldPath}: ${readLessonField(snapshot.lesson, fieldPath) ?? "(empty)"}`),
    ...snapshot.activities.map((activity) => renderActivity(activity, true, true)),
    "LESSON CONTENT END>>>",
  ].join("\n\n");
}

function valueProblem({
  activity,
  currentValue,
  fieldPath,
  proposedValue,
}: {
  activity: QaActivity | null;
  currentValue: string | null;
  fieldPath: string;
  proposedValue: string;
}): string | null {
  if (currentValue === null) {
    return `${fieldPath} does not exist in this content.`;
  }

  if (!proposedValue || sameText(proposedValue, currentValue)) {
    return `The new value for ${fieldPath} is empty or unchanged.`;
  }

  if (isSetupFieldPath(fieldPath)) {
    return setupFieldUpdate(fieldPath, proposedValue) ? null : `"${proposedValue}" is not allowed for ${fieldPath}.`;
  }

  if (proposedValue.length > MAX_FIELD_LENGTH) {
    return `The new value for ${fieldPath} is too long.`;
  }

  if (fieldPath === "question.answerKey" && !validAnswerKey(activity?.question?.options ?? [], proposedValue)) {
    return `The answer key "${proposedValue}" names options that do not exist.`;
  }

  return null;
}

function validAnswerKey(options: Array<{ id: string }>, value: string): boolean {
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);

  return ids.length > 0 && ids.every((id) => options.some((option) => option.id === id));
}

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function renderFinding(shortId: string, finding: QaFinding): string {
  const criterion = criterionById(finding.criterionId);
  const hint = finding.proposedPatch?.proposedValue;

  return [
    `${shortId} [${finding.severity}] ${finding.criterionId} — ${describeField(finding.activityId, finding.fieldPath ?? "whole content")}`,
    `  Standard: ${criterion?.requirement ?? finding.criterionId}`,
    `  Expected: ${finding.expectedBehavior}`,
    `  Problem: ${finding.rationale}`,
    ...finding.evidence.map((item) => `  Evidence (${item.label}): ${item.quote}`),
    hint ? `  Suggested value from the check: ${hint}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderEditableFields(keys: Set<string>): string {
  if (keys.size === 0) {
    return "(none)";
  }

  return [...keys]
    .map((key) => {
      const [activityId, fieldPath] = key.split("::");

      return `- ${describeField(activityId || null, fieldPath)}`;
    })
    .join("\n");
}

function describeField(activityId: string | null, fieldPath: string): string {
  return activityId ? `activity ${activityId}: ${fieldPath}` : fieldPath;
}

function allowedFieldPaths(keys: Set<string>): string[] {
  return [...new Set([...keys].map((key) => key.split("::")[1]))];
}

function schemaFor(findingIds: string[], fieldPaths: string[]) {
  return objectSchema({
    revisions: {
      type: "array",
      items: objectSchema({
        findingIds: { type: "array", items: { type: "string", enum: findingIds } },
        activityId: nullableString,
        fieldPath: { type: "string", enum: fieldPaths },
        newValue: { type: "string" },
        rationale: { type: "string" },
      }),
    },
    unresolved: {
      type: "array",
      items: objectSchema({
        findingId: { type: "string", enum: findingIds },
        reason: { type: "string" },
      }),
    },
  });
}

function parseRevisionOutput(
  value: unknown,
): { revisions: RawRevision[]; unresolved: Array<{ findingId: string; reason: string }> } | null {
  const revisions = parseItems(value, "revisions", (record) => {
    const fieldPath = readString(record, "fieldPath");
    const newValue = readString(record, "newValue");

    return fieldPath && newValue !== null
      ? {
          findingIds: readStrings(record, "findingIds"),
          activityId: readString(record, "activityId"),
          fieldPath,
          newValue,
          rationale: readString(record, "rationale") ?? "",
        }
      : null;
  });
  const unresolved = parseItems(value, "unresolved", (record) => {
    const findingId = readString(record, "findingId");

    return findingId ? { findingId, reason: readString(record, "reason") ?? "" } : null;
  });

  return revisions && unresolved ? { revisions, unresolved } : null;
}
