import type { KyronDraftContentResponse, KyronRevisionChange, KyronRevisionKind, KyronRevisionVersion } from "@/types/api";

export type LiveStatus = "in_kyron" | "changed_since" | "not_applied" | "applied_later" | "not_checked";

// Every field of the current Kyron read, by revision key.
export function currentValues(content: KyronDraftContentResponse | null): Map<string, string | null> | null {
  if (!content) {
    return null;
  }

  const fields = [
    ...content.lessonFields,
    ...content.activities.flatMap((activity) => [...activity.fields, ...activity.scenes.flatMap((scene) => scene.fields)]),
    ...content.vocabulary.flatMap((entry) => [entry.term, entry.definition]),
  ];

  return new Map(fields.flatMap((field) => (field.key ? [[field.key, field.value] as const] : [])));
}

// Whether a QA change is what Kyron holds now.
export function liveStatus(
  kind: KyronRevisionKind,
  change: KyronRevisionChange,
  current: Map<string, string | null> | null,
): LiveStatus {
  if (kind === "qa_proposed") {
    return change.appliedInVersion ? "applied_later" : "not_applied";
  }

  if (!current || !current.has(change.key)) {
    return "not_checked";
  }

  return normalize(current.get(change.key) ?? "") === normalize(change.after) ? "in_kyron" : "changed_since";
}

// The newest QA version that changed each field, for the markers on Tab A.
export function latestRevisionByKey(versions: KyronRevisionVersion[]): Map<string, number> {
  const latest = new Map<string, number>();

  for (const version of versions) {
    if (version.kind !== "qa_applied" && version.kind !== "qa_approved") {
      continue;
    }

    for (const change of version.changes) {
      latest.set(change.key, Math.max(latest.get(change.key) ?? 0, version.versionNumber));
    }
  }

  return latest;
}

export function isQaVersion(kind: KyronRevisionKind): boolean {
  return kind === "qa_applied" || kind === "qa_approved" || kind === "qa_proposed";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
