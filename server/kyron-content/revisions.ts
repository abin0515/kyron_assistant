import "server-only";

import {
  findLessonByKyronDraft,
  getContentVersion,
  getRun,
  listContentVersions,
} from "@/server/qa/repository";
import { fieldKey, REVISION_AGENT_NAME } from "@/server/qa/revision-agent";
import { criterionById } from "@/server/qa/rubrics";
import type { StoredQaRun } from "@/server/qa/types";
import type {
  KyronDraftRevisionsResponse,
  KyronRevisionChange,
  KyronRevisionFinding,
  KyronRevisionKind,
  KyronRevisionVersion,
  QaContentVersion,
  QaFinding,
  QaVersionContent,
} from "@/types/api";

const MAX_VERSIONS = 50;
const KYRON_READ_AUTHOR = "Kyron generation";
const LESSON_FIELD_LABELS: Record<string, string> = {
  "lesson.title": "Name",
  "lesson.audience": "Audience",
  "lesson.objective": "Objective",
  "lesson.description": "Description",
  "lesson.learningObjectives": "Learning objectives",
  "lesson.durationSeconds": "Duration",
  "lesson.assetType": "Lesson type",
};
const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  narration: "Script",
  onScreenText: "On-screen text",
  tutorGuidance: "Tutor guidance",
  "question.prompt": "Question",
  "question.rationale": "Model answer or explanation",
  "question.answerKey": "Answer key",
  activity: "Activity",
};
const SCENE_FIELD_LABELS: Record<string, string> = {
  narration: "Narration",
  title: "Title",
  onScreenText: "On-screen text",
};

// The content versions of a Kyron draft's lesson, newest first, with each
// change placed in plain words and tied to the finding behind it. Reads the
// database only; nothing is read from Kyron.
export async function getKyronDraftRevisions(draftId: number): Promise<KyronDraftRevisionsResponse> {
  const lesson = await findLessonByKyronDraft(draftId);

  if (!lesson) {
    return { draftId, lessonTitle: null, latestRunId: null, versions: [] };
  }

  const { items } = await listContentVersions({ lessonId: lesson.id, target: "lesson" }, { page: 1, pageSize: MAX_VERSIONS });
  const runs = new Map<string, Promise<StoredQaRun | null>>();
  const runFor = (runId: string | null) => {
    if (!runId) {
      return Promise.resolve(null);
    }

    if (!runs.has(runId)) {
      runs.set(runId, getRun(runId));
    }

    return runs.get(runId) ?? Promise.resolve(null);
  };
  const versions = await Promise.all(items.map(async (summary) => toRevisionVersion(summary, await runFor(summary.runId))));

  return {
    draftId,
    lessonTitle: lesson.title,
    latestRunId: lesson.latestRunId,
    versions: markAppliedProposals(versions),
  };
}

async function toRevisionVersion(summary: QaContentVersion, run: StoredQaRun | null): Promise<KyronRevisionVersion> {
  const content = summary.changes.length > 0 ? (await getContentVersion(summary.id))?.content ?? null : null;
  const findings = new Map((run?.findings ?? []).map((finding) => [finding.id, finding]));

  return {
    id: summary.id,
    versionNumber: summary.versionNumber,
    kind: revisionKind(summary),
    author: summary.author,
    model: summary.model,
    summary: summary.summary,
    runId: summary.runId,
    createdAt: summary.createdAt,
    changes: summary.changes.map((change): KyronRevisionChange => ({
      key: fieldKey(change.activityId, change.fieldPath),
      location: describeLocation(content, change.activityId, change.fieldPath),
      before: change.before,
      after: change.after,
      rationale: change.rationale,
      findings: change.findingIds.flatMap((id) => {
        const finding = findings.get(id);

        return finding ? [toRevisionFinding(finding)] : [];
      }),
      appliedInVersion: null,
    })),
  };
}

export function revisionKind(version: Pick<QaContentVersion, "status" | "author" | "changes">): KyronRevisionKind {
  if (version.status === "proposed") {
    return "qa_proposed";
  }

  if (version.author.startsWith(REVISION_AGENT_NAME)) {
    return version.author === REVISION_AGENT_NAME ? "qa_applied" : "qa_approved";
  }

  return version.changes.length === 0 || version.author === KYRON_READ_AUTHOR ? "kyron_read" : "outside_change";
}

// A proposal whose exact text a later QA version applied is marked with that
// version, so it does not read as still waiting.
export function markAppliedProposals(versions: KyronRevisionVersion[]): KyronRevisionVersion[] {
  const appliedByQa = versions.filter((version) => version.kind === "qa_applied" || version.kind === "qa_approved");

  return versions.map((version) =>
    version.kind !== "qa_proposed"
      ? version
      : {
          ...version,
          changes: version.changes.map((change) => ({
            ...change,
            appliedInVersion:
              appliedByQa
                .filter((later) => later.versionNumber > version.versionNumber)
                .sort((left, right) => left.versionNumber - right.versionNumber)
                .find((later) => later.changes.some((other) => other.key === change.key && other.after === change.after))
                ?.versionNumber ?? null,
          })),
        },
  );
}

// "Read PDE Notation › Scene 2 “Order of a PDE” › Narration".
export function describeLocation(content: QaVersionContent | null, activityId: string | null, fieldPath: string): string {
  if (activityId === null || fieldPath.startsWith("lesson.") || fieldPath.startsWith("setup.")) {
    return `Lesson › ${LESSON_FIELD_LABELS[fieldPath] ?? fieldPath}`;
  }

  const activity = content?.activities.find((candidate) => candidate.id === activityId);
  const activityName = activity?.title ?? (activityId === "vocabulary" ? "Vocabulary" : `Activity ${activityId}`);
  const term = /^vocabulary\.([^.]+)\.(term|definition)$/.exec(fieldPath);

  if (term) {
    const entry = activity?.terms?.find((candidate) => candidate.id === term[1]);

    return `Vocabulary › ${entry ? `“${entry.term}”` : `Term ${term[1]}`} › ${term[2] === "term" ? "Term" : "Definition"}`;
  }

  const scene = /^scenes\.([^.]+)\.(narration|title|onScreenText)$/.exec(fieldPath);

  if (scene) {
    const scenes = activity?.scenes ?? [];
    const index = scenes.findIndex((candidate) => candidate.id === scene[1]);
    const title = index >= 0 ? scenes[index].title : null;
    const sceneName = index >= 0 ? `Scene ${index + 1}${title ? ` “${title}”` : ""}` : `Scene ${scene[1]}`;

    return `${activityName} › ${sceneName} › ${SCENE_FIELD_LABELS[scene[2]]}`;
  }

  return `${activityName} › ${ACTIVITY_FIELD_LABELS[fieldPath] ?? fieldPath}`;
}

function toRevisionFinding(finding: QaFinding): KyronRevisionFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    criterionId: finding.criterionId,
    criterionTitle: criterionById(finding.criterionId)?.title ?? finding.criterionId,
    status: finding.status,
    observedText: finding.observedText,
    expectedBehavior: finding.expectedBehavior,
    rationale: finding.rationale,
    decision: finding.decision,
  };
}
