import "server-only";

import { createHash } from "node:crypto";

import { logEvent } from "@/server/logging/writer";
import type {
  QaActivity,
  QaContentChange,
  QaContentVersionDetail,
  QaLesson,
  QaLessonContent,
  QaLessonSnapshot,
  QaRunTarget,
  QaVersionContent,
} from "@/types/api";

import { isSetupFieldPath, readSetupField, SETUP_FIELD_PATHS, writeSetupField } from "./course-setup-fields";
import { getLatestAppliedVersion, insertContentVersion } from "./repository";
import { REVISION_AGENT_NAME, type Revision } from "./revision-agent";
import {
  PATCHABLE_ACTIVITY_FIELDS,
  readActivityField,
  writeActivityField,
  writeLessonField,
} from "./snapshot";
import type { StoredQaRun } from "./types";

type VersionRun = Pick<StoredQaRun, "id" | "target" | "source" | "createdBy" | "findings" | "workspaceId">;

// Records the content a run read, when it differs from the latest version:
// the first read of a lesson, or a change made outside the QA agent.
export async function recordReadVersion({
  lesson,
  run,
  snapshot,
}: {
  lesson: QaLesson;
  run: VersionRun;
  snapshot: QaLessonSnapshot;
}): Promise<QaContentVersionDetail | null> {
  const content = toVersionContent(snapshot);
  const latest = await getLatestAppliedVersion(lesson.id, run.target);

  if (latest?.contentHash === hashVersionContent(content)) {
    return null;
  }

  // Content from another source (a pasted copy before Kyron was connected)
  // is not an earlier state of this content, so nothing is diffed against it.
  const comparable = latest?.source === run.source ? latest : null;
  const changes = comparable ? diffContent(comparable.content, content, run.target) : [];

  return saveVersion({
    lesson,
    run,
    parent: latest,
    status: "applied",
    author: readAuthor(run, latest),
    model: null,
    content,
    changes,
    summary: comparable
      ? `${changes.length} field(s) changed outside the QA agent since v${comparable.versionNumber}.`
      : firstReadSummary(run),
  });
}

// Records the content after the revision agent's changes were written and
// read back.
export async function recordRevisionVersion({
  author = REVISION_AGENT_NAME,
  lesson,
  model,
  revisions,
  run,
  snapshot,
}: {
  author?: string;
  lesson: QaLesson;
  model: string | null;
  revisions: Revision[];
  run: VersionRun;
  snapshot: QaLessonSnapshot;
}): Promise<QaContentVersionDetail> {
  const changes = revisions.map((revision) => toChange(revision, run));

  return saveVersion({
    lesson,
    run,
    parent: await getLatestAppliedVersion(lesson.id, run.target),
    status: "applied",
    author,
    model,
    content: toVersionContent(snapshot),
    changes,
    summary: `Revised ${changes.length} field(s) to resolve ${countFindings(changes)} finding(s).`,
  });
}

// Records revisions that were not applied, as the content would read with
// them, so a person can review or apply them.
export async function recordProposedVersion({
  lesson,
  model,
  note,
  revisions,
  run,
  snapshot,
}: {
  lesson: QaLesson;
  model: string | null;
  note: string;
  revisions: Revision[];
  run: VersionRun;
  snapshot: QaLessonSnapshot;
}): Promise<QaContentVersionDetail> {
  const changes = revisions.map((revision) => toChange(revision, run));

  return saveVersion({
    lesson,
    run,
    parent: await getLatestAppliedVersion(lesson.id, run.target),
    status: "proposed",
    author: REVISION_AGENT_NAME,
    model,
    content: applyRevisions(toVersionContent(snapshot), revisions),
    changes,
    summary: `Proposed ${changes.length} change(s) for ${countFindings(changes)} finding(s); not applied: ${note}.`,
  });
}

export function hashVersionContent(content: QaVersionContent): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function toVersionContent(snapshot: QaLessonSnapshot): QaVersionContent {
  return { lesson: snapshot.lesson, activities: snapshot.activities };
}

async function saveVersion({
  author,
  changes,
  content,
  lesson,
  model,
  parent,
  run,
  status,
  summary,
}: {
  author: string;
  changes: QaContentChange[];
  content: QaVersionContent;
  lesson: QaLesson;
  model: string | null;
  parent: QaContentVersionDetail | null;
  run: VersionRun;
  status: QaContentVersionDetail["status"];
  summary: string;
}): Promise<QaContentVersionDetail> {
  const version = await insertContentVersion({
    lessonId: lesson.id,
    target: run.target,
    parentVersionId: parent?.id ?? null,
    status,
    source: run.source,
    author,
    model,
    runId: run.id,
    workspaceId: run.workspaceId,
    kyronDraftId: lesson.kyronLessonId,
    contentHash: hashVersionContent(content),
    summary,
    changes,
    content,
  });

  await logEvent({
    category: "qa",
    event: "qa.content.version",
    message: `${run.target === "course_setup" ? "Setup" : "Lesson"} v${version.versionNumber} (${status}) by ${author}${model ? ` (${model})` : ""}: ${summary}`,
    qaRunId: run.id,
    workspaceId: run.workspaceId,
    kyronDraftId: lesson.kyronLessonId,
    data: {
      versionId: version.id,
      versionNumber: version.versionNumber,
      parentVersionId: version.parentVersionId,
      status,
      author,
      model,
      contentHash: version.contentHash,
      changes: changes.map(({ activityId, after, before, fieldPath }) => ({ activityId, fieldPath, before, after })),
    },
  });

  return version;
}

function readAuthor(run: VersionRun, latest: QaContentVersionDetail | null): string {
  switch (run.source) {
    case "manual":
      return `Pasted by ${run.createdBy}`;
    case "kyron_mcp":
      // A first read after a pasted copy is still Kyron's own generation.
      return latest?.source === "kyron_mcp" ? "Changed in Kyron outside the QA agent" : "Kyron generation";
    case "workspace_setup":
      return latest ? "Edited in the workspace" : "Workspace course setup";
  }
}

function firstReadSummary(run: VersionRun): string {
  switch (run.source) {
    case "manual":
      return "Generated lesson pasted on the workspace page.";
    case "kyron_mcp":
      return "Generated lesson read from Kyron.";
    case "workspace_setup":
      return "Course setup read from the workspace.";
  }
}

function toChange(revision: Revision, run: VersionRun): QaContentChange {
  const criteria = run.findings
    .filter((finding) => revision.findingIds.includes(finding.id))
    .map((finding) => finding.criterionId);

  return {
    activityId: revision.activityId,
    fieldPath: revision.fieldPath,
    before: revision.currentValue,
    after: revision.proposedValue,
    rationale: revision.rationale,
    findingIds: revision.findingIds,
    criterionIds: [...new Set(criteria)],
  };
}

function countFindings(changes: QaContentChange[]): number {
  return new Set(changes.flatMap((change) => change.findingIds)).size;
}

function applyRevisions(content: QaVersionContent, revisions: Revision[]): QaVersionContent {
  return revisions.reduce<QaVersionContent>(
    (current, revision) =>
      isSetupFieldPath(revision.fieldPath)
        ? { ...current, lesson: writeSetupField(current.lesson, revision.fieldPath, revision.proposedValue) }
        : revision.fieldPath.startsWith("lesson.")
          ? { ...current, lesson: writeLessonField(current.lesson, revision.fieldPath, revision.proposedValue) }
          : {
            ...current,
            activities: current.activities.map((activity) =>
              activity.id === revision.activityId
                ? writeActivityField(activity, revision.fieldPath, revision.proposedValue)
                : activity,
            ),
          },
    content,
  );
}

// Field-level differences between two versions, for changes made outside
// the QA agent.
function diffContent(
  before: QaVersionContent,
  after: QaVersionContent,
  target: QaRunTarget,
): QaContentChange[] {
  const change = (activityId: string | null, fieldPath: string, from: string | null, to: string): QaContentChange => ({
    activityId,
    fieldPath,
    before: from,
    after: to,
    rationale: "Changed outside the QA agent.",
    findingIds: [],
    criterionIds: [],
  });
  const lessonChanges = SETUP_FIELD_PATHS.flatMap((fieldPath) => {
    const from = readSetupField(before.lesson, fieldPath);
    const to = readSetupField(after.lesson, fieldPath);

    return from === to ? [] : [change(null, lessonFieldLabel(fieldPath, target), from, to ?? "")];
  });
  const previous = new Map(before.activities.map((activity) => [activity.id, activity]));
  const activityChanges = after.activities.flatMap((activity) => {
    const earlier = previous.get(activity.id);

    if (!earlier) {
      return [change(activity.id, "activity", null, "Added")];
    }

    return [...new Set([...diffFieldPaths(earlier), ...diffFieldPaths(activity)])].flatMap((fieldPath) => {
      const from = readActivityField(earlier, fieldPath);
      const to = readActivityField(activity, fieldPath);

      return from === to ? [] : [change(activity.id, fieldPath, from, to ?? "")];
    });
  });
  const removed = before.activities
    .filter((activity) => !after.activities.some((candidate) => candidate.id === activity.id))
    .map((activity) => change(activity.id, "activity", "Present", "Removed"));

  return [...lessonChanges, ...activityChanges, ...removed];
}

// Every text field of an activity, scenes and vocabulary terms included.
function diffFieldPaths(activity: QaActivity): string[] {
  return [
    ...PATCHABLE_ACTIVITY_FIELDS,
    ...(activity.scenes ?? []).flatMap((scene) => ["narration", "title", "onScreenText"].map((field) => `scenes.${scene.id}.${field}`)),
    ...(activity.terms ?? []).flatMap((term) => [`vocabulary.${term.id}.term`, `vocabulary.${term.id}.definition`]),
  ];
}

function lessonFieldLabel(fieldPath: (typeof SETUP_FIELD_PATHS)[number], target: QaRunTarget): string {
  if (target === "course_setup") {
    return fieldPath;
  }

  const labels: Record<(typeof SETUP_FIELD_PATHS)[number], keyof QaLessonContent> = {
    "setup.name": "title",
    "setup.description": "description",
    "setup.learningObjective": "learningObjectives",
    "setup.audience": "audience",
    "setup.duration": "durationSeconds",
    "setup.assetType": "assetType",
  };

  return `lesson.${labels[fieldPath]}`;
}
