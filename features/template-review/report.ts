import { ASSET_KIND_LABELS, assetKindFor } from "@/lib/length-targets";
import type {
  AssetKind,
  LengthLevel,
  QaActivity,
  QaContentChange,
  QaRunDetailResponse,
} from "@/types/api";

export type ReportAsset = {
  activityId: string;
  title: string;
  kind: AssetKind;
  kindLabel: string;
  anchor: string;
};

export type ReportTopic = {
  key: string;
  topic: string;
  objectives: string[];
  // Only the topic's video length is reported (with its category).
  video: { minutes: number; category: LengthLevel } | null;
  assets: ReportAsset[];
};

// One fix as a person reads it. Findings from several checks that QA resolved
// with the same change are one fix, so they share a card.
export type ReportFix = {
  id: string;
  findingIds: string[];
  // The checks that found it, without repeats.
  titles: string[];
  where: string;
  reasons: string[];
  changes: QaContentChange[];
};

export type ReportFlag = {
  id: string;
  title: string;
  where: string;
  reason: string;
};

export type ModuleReport = {
  topics: ReportTopic[];
  // Findings QA changed the content for.
  fixed: ReportFix[];
  // Findings a re-check no longer reported, without a change by QA.
  resolved: ReportFix[];
  noted: ReportFix[];
  flagged: ReportFlag[];
};

const REVISION_AUTHOR = "QA revision agent";
const VERIFIER_AUTHOR = "QA verifier";
const BLOCKING = new Set(["critical", "major"]);

// The report a person reads after a module is generated: what each asset
// covers, each topic's video length, what QA fixed, and what needs a human.
// Activity and practice lengths are measured by QA but not shown here.
export function buildModuleReport(detail: QaRunDetailResponse): ModuleReport {
  const activities = detail.snapshot?.activities ?? [];
  const titleOf = criterionTitles(detail);
  const where = (activityId: string | null) => describeWhere(activities, activityId);
  const qaChanges = keptChanges(detail);
  const toFix = (finding: QaRunDetailResponse["run"]["findings"][number]): ReportFix => ({
    id: finding.id,
    findingIds: [finding.id],
    titles: [titleOf(finding.criterionId)],
    where: where(finding.activityId),
    reasons: [finding.rationale],
    changes: qaChanges.filter((change) => change.findingIds.includes(finding.id)),
  });
  const findings = detail.run.findings;

  const fixes = findings.filter((finding) => finding.status === "fixed").map((finding) => ({ finding, fix: toFix(finding) }));
  const changed = ({ finding, fix }: (typeof fixes)[number]) => fix.changes.length > 0 || finding.repairAttempts > 0;

  return {
    topics: reportTopics(detail),
    fixed: mergeSharedFixes(
      fixes.filter(changed).map(({ fix }) => fix),
      qaChanges,
    ),
    resolved: fixes.filter((item) => !changed(item)).map(({ fix }) => fix),
    noted: findings
      .filter((finding) => finding.status === "open" && finding.severity === "minor" && finding.evaluator !== "length")
      .map(toFix),
    flagged: [
      ...findings
        .filter((finding) => finding.status === "escalated")
        .map((finding) => ({
          id: finding.id,
          title: titleOf(finding.criterionId),
          where: where(finding.activityId),
          reason: finding.escalationReason ?? finding.rationale,
        })),
      // Blocking problems QA proposed a fix for but could not write to Kyron.
      ...findings
        .filter((finding) => BLOCKING.has(finding.severity) && (finding.status === "open" || finding.status === "accepted"))
        .map((finding) => ({
          id: finding.id,
          title: titleOf(finding.criterionId),
          where: where(finding.activityId),
          reason: `${finding.rationale} QA could not apply a fix to this draft${finding.proposedPatch ? `; proposed: "${finding.proposedPatch.proposedValue}"` : ""}.`,
        })),
      ...findings
        .filter((finding) => finding.evaluator === "length" && finding.status === "open")
        .map((finding) => ({
          id: finding.id,
          title: titleOf(finding.criterionId),
          where: where(finding.activityId),
          reason: finding.rationale,
        })),
      ...detail.run.checks
        .filter((check) => check.evaluator !== "length" && (check.status === "needs_review" || check.status === "not_tested"))
        .map((check) => ({
          id: check.id,
          title: titleOf(check.criterionId),
          where: where(check.activityId),
          reason: `${check.status === "not_tested" ? "Could not be checked automatically" : "Needs a person's review"}: ${check.summary}`,
        })),
      ...detail.run.humanChecks
        .filter((check) => check.status === "pending")
        .map((check) => ({
          id: check.criterionId,
          title: check.title,
          where: "Rendered lesson",
          reason: `Only a person can check this: ${detail.criteria.find((criterion) => criterion.id === check.criterionId)?.requirement ?? check.title}`,
        })),
    ],
  };
}

// Topics in lesson order with their objectives and assets; assets without a
// topic (pasted lessons) form one "Lesson" group.
export function reportTopics(detail: QaRunDetailResponse): ReportTopic[] {
  const sections = detail.snapshot?.lesson.sections ?? [];
  const lessonObjectives = detail.snapshot?.lesson.learningObjectives ?? [];
  const topicVideos = detail.run.lengths?.topicVideos ?? [];
  const groups = new Map<string, ReportTopic>();
  const groupFor = (sectionId: string | null) => {
    const key = sectionId ?? "lesson";
    const section = sections.find((candidate) => candidate.id === sectionId);
    const video = topicVideos.find((candidate) => candidate.sectionId === sectionId);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        topic: section?.topic ?? (sectionId ? `Topic ${groups.size + 1}` : "Lesson"),
        // The lesson's objectives only stand in for content with no topic.
        objectives: section ? section.objectives : sectionId ? [] : lessonObjectives,
        video: video ? { minutes: video.minutes, category: video.category } : null,
        assets: [],
      });
    }

    return groups.get(key) as ReportTopic;
  };

  sections.forEach((section) => groupFor(section.id));

  for (const activity of detail.snapshot?.activities ?? []) {
    const kind = assetKindFor(activity);

    if (kind) {
      groupFor(activity.sectionId ?? null).assets.push({
        activityId: activity.id,
        title: activity.title ?? `Activity ${activity.id}`,
        kind,
        kindLabel: ASSET_KIND_LABELS[kind],
        anchor: assetAnchor(activity.id),
      });
    }
  }

  return [...groups.values()].filter((group) => group.assets.length > 0);
}

export function assetAnchor(activityId: string): string {
  return `asset-${activityId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

// Fixes that share a change are one fix; groups chain through shared changes
// (A and B share one, B and C another). Groups keep the order of their first
// finding, and a fix with no kept change stays on its own.
export function mergeSharedFixes(fixes: ReportFix[], qaChanges: QaContentChange[]): ReportFix[] {
  const parent = fixes.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;

    while (parent[current] !== current) {
      current = parent[current];
    }

    return current;
  };

  fixes.forEach((fix, index) => {
    for (let other = 0; other < index; other += 1) {
      if (fix.changes.some((change) => fixes[other].changes.includes(change))) {
        parent[root(index)] = root(other);
      }
    }
  });

  const groups = new Map<number, ReportFix[]>();

  fixes.forEach((fix, index) => {
    const key = root(index);

    groups.set(key, [...(groups.get(key) ?? []), fix]);
  });

  return [...groups.values()].map((group) => (group.length === 1 ? group[0] : combineFixes(group, qaChanges)));
}

function combineFixes(group: ReportFix[], qaChanges: QaContentChange[]): ReportFix {
  const unique = <T>(values: T[]) => [...new Set(values)];

  return {
    id: group[0].id,
    findingIds: group.flatMap((fix) => fix.findingIds),
    titles: unique(group.flatMap((fix) => fix.titles)),
    where: unique(group.map((fix) => fix.where)).join(", "),
    reasons: unique(group.flatMap((fix) => fix.reasons)),
    // Each change once, in the same order as everywhere else in the report.
    changes: qaChanges.filter((change) => group.some((fix) => fix.changes.includes(change))),
  };
}

// This run's applied QA changes, without the ones the verifier undid.
function keptChanges(detail: QaRunDetailResponse): QaContentChange[] {
  const ofRun = detail.versions.filter((version) => version.runId === detail.run.id && version.status === "applied");
  const undone = ofRun.filter((version) => version.author === VERIFIER_AUTHOR).flatMap((version) => version.changes);

  return ofRun
    .filter((version) => version.author.startsWith(REVISION_AUTHOR))
    .flatMap((version) => version.changes)
    .filter(
      (change) =>
        !undone.some(
          (undo) => undo.activityId === change.activityId && undo.fieldPath === change.fieldPath && undo.before === change.after,
        ),
    );
}

function describeWhere(activities: QaActivity[], activityId: string | null): string {
  if (!activityId) {
    return "Whole lesson";
  }

  const activity = activities.find((candidate) => candidate.id === activityId);

  return activity?.title ?? `Activity ${activityId}`;
}

function criterionTitles(detail: QaRunDetailResponse): (criterionId: string) => string {
  return (criterionId) => detail.criteria.find((criterion) => criterion.id === criterionId)?.title ?? criterionId;
}
