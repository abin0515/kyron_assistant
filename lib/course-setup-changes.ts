import type { CourseSetupFields } from "@/lib/course-setup";
import { QA_REVISION_AUTHOR, QA_VERIFIER_AUTHOR, type QaContentVersion } from "@/types/api";

// The value the QA agent last wrote to each setup field, as the setup check's
// version history records it ("setup.description" → its text).
export type QaSetupValues = Partial<Record<keyof CourseSetupFields, string>>;

const SETUP_FIELDS = ["name", "description", "learningObjective", "audience", "assetType", "duration"] as const;

// Where the setup now differs from the AI's draft: fields that still hold the
// QA agent's fix, and fields someone else changed (an edit, or a later change
// to a field QA had fixed).
export function setupChanges(
  current: CourseSetupFields,
  generated: CourseSetupFields,
  qaValues: QaSetupValues,
): { qaFixed: boolean; edited: boolean } {
  let qaFixed = false;
  let edited = false;

  for (const field of SETUP_FIELDS) {
    const value = fieldText(current, field);

    if (value === fieldText(generated, field)) {
      continue;
    }

    if (qaValues[field]?.trim() === value) {
      qaFixed = true;
    } else {
      edited = true;
    }
  }

  return { qaFixed, edited };
}

// Newest first: each field's latest applied change decides. A change from
// outside the QA agent (recorded when QA read the setup again) means the
// field is no longer QA's, even if QA fixed it earlier.
export function qaSetupValues(versions: Pick<QaContentVersion, "status" | "author" | "changes">[]): QaSetupValues {
  const values: QaSetupValues = {};
  const decided = new Set<string>();

  for (const version of versions) {
    if (version.status !== "applied") {
      continue;
    }

    for (const change of version.changes) {
      const field = change.fieldPath.startsWith("setup.") ? change.fieldPath.slice("setup.".length) : null;

      if (!field || !isSetupField(field) || decided.has(field)) {
        continue;
      }

      decided.add(field);

      if (isQaAuthor(version.author)) {
        values[field] = change.after;
      }
    }
  }

  return values;
}

export function sameQaSetupValues(left: QaSetupValues, right: QaSetupValues): boolean {
  return SETUP_FIELDS.every((field) => left[field] === right[field]);
}

function isQaAuthor(author: string): boolean {
  return author.startsWith(QA_REVISION_AUTHOR) || author === QA_VERIFIER_AUTHOR;
}

function fieldText(setup: CourseSetupFields, field: keyof CourseSetupFields): string {
  return String(setup[field]).trim();
}

function isSetupField(value: string): value is keyof CourseSetupFields {
  return (SETUP_FIELDS as readonly string[]).includes(value);
}
