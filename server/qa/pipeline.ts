import "server-only";

import path from "node:path";

import { runWithLogContext } from "@/server/logging/context";
import { logEvent } from "@/server/logging/writer";
import type {
  QaContentSourceKind,
  QaFinding,
  QaLesson,
  QaLessonSnapshot,
  QaPatchProposal,
  QaRunTarget,
} from "@/types/api";

import {
  ContentSourceUnavailableError,
  getContentSource,
  type LessonContentSource,
} from "./content-sources";
import {
  recordProposedVersion,
  recordReadVersion,
  recordRevisionVersion,
} from "./content-versions";
import { configurationProblem, describeError } from "./errors";
import {
  evaluatorOrderFor,
  evaluatorsAffectedBy,
  LESSON_LEVEL_EVALUATORS,
  SCRIPT_EVALUATORS,
} from "./evaluators";
import { evaluateNarrationMatch } from "./evaluators/media";
import type { EvaluationOutput } from "./evaluators/types";
import {
  applyPatch,
  autonomyPolicy,
  decideRepair,
  MAX_REPAIR_ATTEMPTS,
  type AutonomyPolicy,
  type RepairDecision,
} from "./repair";
import {
  claimRun,
  getLesson,
  getSnapshot,
  listRunIdsWithPendingWork,
  readMediaFile,
  releaseRun,
  saveMediaFile,
  saveRun,
  saveSnapshot,
  updateLesson,
} from "./repository";
import {
  fieldKey,
  REVISION_AGENT_NAME,
  reviseContent,
  type Revision,
  type RevisionResult,
} from "./revision-agent";
import { getRubricPack } from "./rubrics";
import {
  addUsage,
  appendEvent,
  computeOutcome,
  createRunRecord,
  isUnresolvedBlocking,
  mergeEvaluation,
  stageForStep,
  totalTokens,
} from "./run-records";
import { buildSnapshot } from "./snapshot";
import { transcribeMedia } from "./transcription";
import type { QaStep, ScriptEvaluatorId, StoredQaRun } from "./types";

const MAX_STEP_FAILURES = 2;
const MAX_VIDEO_POLLS = 240;
const DRIVER_BATCH_SIZE = 2;
const MAX_TRANSCRIPT_STORED = 50_000;
const AGENT_NAME = "QA agent";

// "retry" keeps the step at the head of the queue for the next tick.
type StepResult = {
  next: QaStep[] | "retry";
  update: (run: StoredQaRun) => StoredQaRun;
};

type RevisionFailure = { revision: Revision; message: string };

type RevisionOutcome = {
  proposedPatch: QaPatchProposal | null;
  // null keeps the finding's status (a change that stays proposed).
  status: QaFinding["status"] | null;
  escalationReason: string | null;
  applied: boolean;
};

// A run either starts from a snapshot that already exists (pasted lesson
// content) or reads its content from the given source on its first step.
export async function startQaRun({
  createdBy,
  lesson,
  snapshot,
  source,
  target,
}: {
  createdBy: string;
  lesson: QaLesson;
  snapshot: QaLessonSnapshot | null;
  source: QaContentSourceKind;
  target: QaRunTarget;
}): Promise<StoredQaRun> {
  const rubric = await getRubricPack(lesson.domain);
  const run = await saveRun(
    createRunRecord({
      createdBy,
      lesson,
      rubric,
      snapshotId: snapshot?.id ?? null,
      source,
      steps: [{ kind: "snapshot" }],
      target,
    }),
  );

  await updateLesson(lesson.id, (current) => ({ ...current, latestRunId: run.id }));

  return run;
}

// Processes the next pending step of one run. Returns null when another
// caller holds the run or it has nothing to do.
export async function processNextStep(runId: string): Promise<StoredQaRun | null> {
  const claim = await claimRun(runId);

  if (!claim) {
    return null;
  }

  const { leaseToken, run } = claim;
  const step = run.pendingSteps[0];
  const startedAt = Date.now();

  return runWithLogContext(
    { qaRunId: run.id, workspaceId: run.workspaceId, actorId: run.ownerId },
    async () => {
      let result: StepResult;

      try {
        result = await executeStep(run, step);
      } catch (error) {
        result = stepFailure(run, step, error);
      }

      const released = await releaseRun(runId, leaseToken, (fresh) => applyStepResult(fresh, result));

      if (released) {
        await logStep(step, released, released.events.slice(run.events.length), Date.now() - startedAt);
      }

      return released;
    },
  );
}

// Called by the worker: advances the runs that have waited longest.
export async function driveQaRuns(limit = DRIVER_BATCH_SIZE): Promise<number> {
  const ready = await listRunIdsWithPendingWork(limit);
  const processed = await Promise.all(ready.map((runId) => processNextStep(runId)));

  return processed.filter(Boolean).length;
}

async function executeStep(run: StoredQaRun, step: QaStep): Promise<StepResult> {
  const lesson = await getLesson(run.lessonId);

  if (!lesson) {
    throw new ContentSourceUnavailableError("The QA lesson record is missing.");
  }

  const source = getContentSource(run.source);

  if (usesModel(step) && totalTokens(run.usage) >= run.tokenBudget) {
    return blocked(
      `The run reached its token budget (${run.tokenBudget.toLocaleString()} tokens). Raise QA_RUN_TOKEN_BUDGET or re-run.`,
    );
  }

  switch (step.kind) {
    case "snapshot":
      return snapshotStep(run, lesson, source);
    case "check":
      return checkStep(run, step.evaluator, step.activityIds);
    case "decide":
      return decideStep(run, source);
    case "revise":
      return reviseStep(run, lesson, source);
    case "recheck":
      return recheckStep(run);
    case "video_request":
      return videoRequestStep(lesson, source);
    case "video_poll":
      return videoPollStep(run, step.attempt, lesson, source);
    case "media_check":
      return mediaCheckStep(run);
    case "finalize":
      return finalizeStep(run);
  }
}

async function snapshotStep(
  run: StoredQaRun,
  lesson: QaLesson,
  source: LessonContentSource,
): Promise<StepResult> {
  if (run.snapshotId) {
    const snapshot = await requireSnapshot(run.snapshotId);
    const version = await recordReadVersion({ lesson, run, snapshot });
    const missing = snapshot.missingFields.length;

    return {
      next: checkSteps(evaluatorOrderFor(run.target), null),
      update: (current) =>
        appendEvent(
          current,
          missing > 0 ? "warn" : "info",
          `Snapshot has ${snapshot.activities.length} activities${missing > 0 ? `; ${missing} required field(s) are missing` : ""}.${versionNote(version)}`,
        ),
    };
  }

  const snapshot = await readLessonSnapshot(lesson, source);
  const version = await recordReadVersion({ lesson, run, snapshot });
  const description =
    source.kind === "workspace_setup"
      ? `Read the course setup with ${snapshot.references.length} source reference(s).`
      : "Read the lesson from Kyron.";

  return {
    next: checkSteps(evaluatorOrderFor(run.target), null),
    update: (current) =>
      appendEvent({ ...current, snapshotId: snapshot.id }, "info", `${description}${versionNote(version)}`),
  };
}

async function checkStep(
  run: StoredQaRun,
  evaluator: ScriptEvaluatorId,
  activityIds: string[] | null,
): Promise<StepResult> {
  const snapshot = await requireSnapshot(run.snapshotId);
  const output = await SCRIPT_EVALUATORS[evaluator]({
    snapshot,
    rubric: await getRubricPack(run.domain),
    activityIds,
  });

  return {
    next: [],
    update: (current) =>
      appendEvent(
        addUsage(
          mergeEvaluation(current, { evaluator, output, scope: activityIds, snapshotId: snapshot.id }),
          output.usage,
        ),
        "info",
        describeEvaluation(evaluator, output),
      ),
  };
}

function decideStep(run: StoredQaRun, source: LessonContentSource): StepResult {
  const unresolved = run.findings.filter(isUnresolvedBlocking);
  const candidates = revisionCandidates(run, source.writable);
  const exhausted = candidates.exhausted.map((finding) => finding.id);

  const escalateExhausted = (current: StoredQaRun) =>
    exhausted.length === 0
      ? current
      : appendEvent(
          updateFindings(current, exhausted, (finding) => ({
            ...finding,
            status: "escalated",
            escalationReason: `Still failing after ${MAX_REPAIR_ATTEMPTS} automatic fixes.`,
          })),
          "warn",
          `${exhausted.length} finding(s) escalated after ${MAX_REPAIR_ATTEMPTS} fix attempts.`,
        );

  if (candidates.ready.length > 0) {
    return { next: [{ kind: "revise" }, { kind: "recheck" }], update: escalateExhausted };
  }

  const readyForVideo =
    run.target === "lesson" &&
    source.supportsVideo &&
    unresolved.length === 0 &&
    !run.findings.some((finding) => finding.status === "escalated") &&
    run.videoJobId === null &&
    run.media === null;

  return {
    next: readyForVideo ? [{ kind: "video_request" }] : [{ kind: "finalize" }],
    update: escalateExhausted,
  };
}

// One revision round: the revision agent proposes changes for every open
// finding at once. Safe changes are written, read back and saved as a new
// content version; the rest are saved as a proposed version.
async function reviseStep(
  run: StoredQaRun,
  lesson: QaLesson,
  source: LessonContentSource,
): Promise<StepResult> {
  const { ready } = revisionCandidates(run, source.writable);

  if (ready.length === 0) {
    return { next: [], update: (current) => current };
  }

  const snapshot = await requireSnapshot(run.snapshotId);
  // A person approved these exact changes, so they are applied as they are.
  const approved: Revision[] = ready.flatMap((finding) =>
    finding.status === "accepted" && finding.proposedPatch
      ? [{ ...finding.proposedPatch, findingIds: [finding.id] }]
      : [],
  );
  const approvedIds = new Set(approved.flatMap((revision) => revision.findingIds));
  const forAgent = ready.filter((finding) => !approvedIds.has(finding.id));
  const agent =
    forAgent.length > 0
      ? await reviseContent({
          findings: forAgent,
          lockedFields: approved.map((revision) => fieldKey(revision.activityId, revision.fieldPath)),
          snapshot,
          target: run.target,
        })
      : null;
  const options = { policy: autonomyPolicy(), writable: source.writable };
  const plans = [...approved, ...(agent?.revisions ?? [])].map((revision) => ({
    revision,
    decision: decideRevision(revision, ready, options),
  }));
  const toApply = plans.filter((plan) => plan.decision.action === "apply").map((plan) => plan.revision);
  const proposed = plans.filter((plan) => plan.decision.action !== "apply").map((plan) => plan.revision);
  const { applied, failure } = await applyRevisions(source, lesson, toApply);
  const after = applied.length > 0 ? await readLessonSnapshot(lesson, source) : null;
  const appliedVersion = after
    ? await recordRevisionVersion({
        author: agent ? REVISION_AGENT_NAME : `${REVISION_AGENT_NAME}, approved by a person`,
        lesson,
        model: agent?.model ?? null,
        revisions: applied,
        run,
        snapshot: after,
      })
    : null;
  const proposedVersion =
    proposed.length > 0
      ? await recordProposedVersion({
          lesson,
          model: agent?.model ?? null,
          note: source.writable ? "the changes need a person's approval" : "apply them in Kyron Studio",
          revisions: proposed,
          run,
          snapshot: after ?? snapshot,
        })
      : null;
  const outcomes = new Map(
    ready.map((finding) => [finding.id, revisionOutcome(finding, { agent, applied, failure, plans, toApply })]),
  );
  const messages: Array<{ level: "info" | "warn"; message: string }> = [];

  if (agent) {
    messages.push({
      level: "info",
      message: `Revision agent (${agent.model}) proposed ${agent.revisions.length} change(s) for ${forAgent.length} finding(s).`,
    });
  }

  if (appliedVersion) {
    messages.push({
      level: "info",
      message: `Applied and read back ${applied.length} change(s): ${applied.map(describeChange).join(", ")}. Saved as content v${appliedVersion.versionNumber}.`,
    });
  }

  if (failure) {
    messages.push({ level: "warn", message: `Stopped applying changes: ${failure.message}` });
  }

  if (proposedVersion) {
    messages.push({
      level: "info",
      message: `Saved ${proposed.length} unapplied change(s) as proposed content v${proposedVersion.versionNumber}${source.writable ? " for approval" : " to apply in Kyron Studio"}.`,
    });
  }

  for (const finding of ready) {
    const reason = outcomes.get(finding.id)?.escalationReason;

    if (reason) {
      messages.push({ level: "warn", message: `Escalated ${describeFinding(finding)}: ${reason}` });
    }
  }

  return {
    next: [],
    update: (current) => {
      const revised = addUsage(
        {
          ...updateFindings(current, [...outcomes.keys()], (finding) =>
            applyOutcome(finding, outcomes.get(finding.id)),
          ),
          snapshotId: after?.id ?? current.snapshotId,
          patchedFields: [
            ...current.patchedFields,
            ...applied.map((revision) => ({ activityId: revision.activityId ?? "", fieldPath: revision.fieldPath })),
          ],
        },
        agent?.usage ? [agent.usage] : [],
      );

      return messages.reduce((next, { level, message }) => appendEvent(next, level, message), revised);
    },
  };
}

// The revise step already re-read the content; re-run what its changes affect.
function recheckStep(run: StoredQaRun): StepResult {
  if (run.patchedFields.length === 0) {
    return { next: [{ kind: "decide" }], update: (current) => current };
  }

  const activityIds = [...new Set(run.patchedFields.map((field) => field.activityId))];
  const affected = new Set(run.patchedFields.flatMap((field) => evaluatorsAffectedBy(field.fieldPath)));

  return {
    next: checkSteps(
      evaluatorOrderFor(run.target).filter((evaluator) => affected.has(evaluator)),
      activityIds,
    ),
    update: (current) =>
      appendEvent(
        { ...current, patchedFields: [] },
        "info",
        `Re-checking what ${run.patchedFields.length} change(s) affect.`,
      ),
  };
}

async function videoRequestStep(
  lesson: QaLesson,
  source: LessonContentSource,
): Promise<StepResult> {
  const jobId = await source.requestVideo(lesson);

  return {
    next: [{ kind: "video_poll", attempt: 1 }],
    update: (current) =>
      appendEvent({ ...current, videoJobId: jobId }, "info", "Requested video generation in Kyron."),
  };
}

async function videoPollStep(
  run: StoredQaRun,
  attempt: number,
  lesson: QaLesson,
  source: LessonContentSource,
): Promise<StepResult> {
  const status = await source.getVideoStatus(lesson, run.videoJobId ?? "");

  if (status === "pending") {
    return attempt >= MAX_VIDEO_POLLS
      ? mediaFailed("Video generation did not finish in time.")
      : { next: [{ kind: "video_poll", attempt: attempt + 1 }], update: (current) => current };
  }

  if (status === "failed") {
    return mediaFailed("Kyron reported that video generation failed.");
  }

  const video = await source.downloadVideo(lesson, run.videoJobId ?? "");
  const filePath = await saveMediaFile(run.id, video.fileName, video.bytes);

  return {
    next: [{ kind: "media_check" }],
    update: (current) =>
      appendEvent(
        {
          ...current,
          mediaFilePath: filePath,
          media: {
            fileName: video.fileName,
            byteSize: video.bytes.byteLength,
            source: "kyron_mcp",
            status: "pending",
            transcript: null,
            message: null,
          },
        },
        "info",
        "Video generated; checking its narration.",
      ),
  };
}

async function mediaCheckStep(run: StoredQaRun): Promise<StepResult> {
  if (!run.mediaFilePath || !run.media) {
    return mediaFailed("No video or audio file is attached.");
  }

  const snapshot = await requireSnapshot(run.snapshotId);
  const transcription = await transcribeMedia(
    await readMediaFile(run.mediaFilePath),
    path.basename(run.mediaFilePath),
  );
  const output = await evaluateNarrationMatch(snapshot, transcription.text);

  return {
    next: [{ kind: "decide" }],
    update: (current) =>
      appendEvent(
        addUsage(
          {
            ...mergeEvaluation(current, { evaluator: "media", output, scope: null, snapshotId: snapshot.id }),
            media: current.media && {
              ...current.media,
              status: "checked",
              transcript: transcription.text.slice(0, MAX_TRANSCRIPT_STORED),
              message: null,
            },
          },
          [transcription.usage, ...output.usage],
        ),
        "info",
        describeEvaluation("media", output),
      ),
  };
}

async function finalizeStep(run: StoredQaRun): Promise<StepResult> {
  const rubric = await getRubricPack(run.domain);

  return {
    next: [],
    update: (current) => {
      const outcome = computeOutcome(current, rubric);
      const sampleAudit =
        (outcome.stage === "passed" || outcome.stage === "verified") &&
        current.audit.sampledAt === null;
      const audit = sampleAudit
        ? {
            ...current.audit,
            sampledAt: new Date().toISOString(),
            required: Math.random() < auditRate(),
          }
        : current.audit;

      return appendEvent(
        {
          ...current,
          stage: outcome.stage,
          stageMessage: outcome.message,
          completedAt: new Date().toISOString(),
          audit: audit.required && audit.outcome === null ? { ...audit, outcome: "pending" } : audit,
        },
        "info",
        `Run finished (${outcome.stage}). ${outcome.message}${sampleAudit && audit.required ? " Selected for a random audit." : ""}`,
      );
    },
  };
}

function stepFailure(run: StoredQaRun, step: QaStep, error: unknown): StepResult {
  const message = describeError(error);
  const configuration = configurationProblem(error);

  if (configuration) {
    return blocked(configuration);
  }

  if (run.stepFailures + 1 < MAX_STEP_FAILURES) {
    return {
      next: "retry",
      update: (current) =>
        appendEvent(
          { ...current, stepFailures: current.stepFailures + 1 },
          "warn",
          `${describeStep(step)} failed (${message}); retrying.`,
        ),
    };
  }

  switch (step.kind) {
    case "check":
      return {
        next: [],
        update: (current) =>
          appendEvent(
            mergeEvaluation(current, {
              evaluator: step.evaluator,
              output: notTestedOutput(step.evaluator, current, message),
              scope: step.activityIds,
              snapshotId: current.snapshotId ?? "",
            }),
            "error",
            `${describeStep(step)} could not run: ${message}`,
          ),
      };
    case "revise":
      return {
        next: [],
        update: (current) => {
          const { ready } = revisionCandidates(current, getContentSource(current.source).writable);

          return appendEvent(
            updateFindings(current, ready.map((finding) => finding.id), (finding) => ({
              ...finding,
              proposalAttempted: true,
              status: "escalated",
              escalationReason: `Automatic revision failed: ${message}`,
            })),
            "error",
            `Revision failed: ${message}`,
          );
        },
      };
    case "media_check":
    case "video_request":
    case "video_poll":
      return mediaFailed(message);
    default:
      return blocked(`${describeStep(step)} failed: ${message}`);
  }
}

function applyStepResult(run: StoredQaRun, result: StepResult): StoredQaRun {
  const pendingSteps =
    result.next === "retry" ? run.pendingSteps : [...result.next, ...run.pendingSteps.slice(1)];
  const updated = result.update({
    ...run,
    pendingSteps,
    stepFailures: result.next === "retry" ? run.stepFailures : 0,
  });

  if (updated.pendingSteps.length === 0) {
    return updated;
  }

  return {
    ...updated,
    stage: stageForStep(updated.pendingSteps[0]),
    stageMessage: `${describeStep(updated.pendingSteps[0])}…`,
  };
}

function blocked(message: string): StepResult {
  return {
    next: [],
    update: (current) =>
      appendEvent(
        { ...current, pendingSteps: [], stage: "blocked", stageMessage: message, completedAt: new Date().toISOString() },
        "error",
        message,
      ),
  };
}

function mediaFailed(message: string): StepResult {
  return {
    next: [{ kind: "finalize" }],
    update: (current) =>
      appendEvent(
        {
          ...current,
          media: current.media
            ? { ...current.media, status: "failed", message }
            : { fileName: "", byteSize: 0, source: "kyron_mcp", status: "failed", transcript: null, message },
        },
        "error",
        `Video check failed: ${message}`,
      ),
  };
}

async function readLessonSnapshot(
  lesson: QaLesson,
  source: LessonContentSource,
): Promise<QaLessonSnapshot> {
  const snapshot = await saveSnapshot(
    buildSnapshot({
      createdBy: AGENT_NAME,
      lessonId: lesson.id,
      packet: await source.readLesson(lesson),
      source: source.kind,
    }),
  );

  await updateLesson(lesson.id, (current) => ({ ...current, latestSnapshotId: snapshot.id }));

  return snapshot;
}

async function requireSnapshot(snapshotId: string | null): Promise<QaLessonSnapshot> {
  const snapshot = snapshotId ? await getSnapshot(snapshotId) : null;

  if (!snapshot) {
    throw new ContentSourceUnavailableError("The lesson snapshot for this run is missing.");
  }

  return snapshot;
}

function checkSteps(
  evaluators: readonly ScriptEvaluatorId[],
  activityIds: string[] | null,
): QaStep[] {
  return [
    ...evaluators.map((evaluator) => ({
      kind: "check" as const,
      evaluator,
      activityIds: LESSON_LEVEL_EVALUATORS.has(evaluator) ? null : activityIds,
    })),
    { kind: "decide" as const },
  ];
}

// Findings the revision agent should work on now, and those that already
// used up their automatic attempts.
function revisionCandidates(
  run: StoredQaRun,
  writable: boolean,
): { ready: QaFinding[]; exhausted: QaFinding[] } {
  const ready: QaFinding[] = [];
  const exhausted: QaFinding[] = [];

  for (const finding of run.findings.filter(isUnresolvedBlocking)) {
    if (!writable) {
      if (!finding.proposalAttempted) {
        ready.push(finding);
      }
    } else if (finding.status === "accepted" || finding.repairAttempts < MAX_REPAIR_ATTEMPTS) {
      ready.push(finding);
    } else {
      exhausted.push(finding);
    }
  }

  return { ready, exhausted };
}

// A change is applied only when every finding it resolves allows that.
function decideRevision(
  revision: Revision,
  findings: QaFinding[],
  options: { policy: AutonomyPolicy; writable: boolean },
): RepairDecision {
  const decisions = findings
    .filter((finding) => revision.findingIds.includes(finding.id))
    .map((finding) =>
      decideRepair({ severity: finding.severity, status: finding.status, proposedPatch: revision }, options),
    );

  return decisions.find((decision) => decision.action !== "apply") ?? { action: "apply" };
}

// Writes changes in order. A concurrent edit stops the round so nothing is
// written over a person's change.
async function applyRevisions(
  source: LessonContentSource,
  lesson: QaLesson,
  revisions: Revision[],
): Promise<{ applied: Revision[]; failure: RevisionFailure | null }> {
  const applied: Revision[] = [];

  for (const revision of revisions) {
    const result = await applyPatch(source, lesson, revision);

    if (result.status !== "applied") {
      return { applied, failure: { revision, message: result.message } };
    }

    applied.push(revision);
  }

  return { applied, failure: null };
}

// What one revision round means for a finding: applied (re-checked next),
// still proposed, or escalated with a reason.
function revisionOutcome(
  finding: QaFinding,
  {
    agent,
    applied,
    failure,
    plans,
    toApply,
  }: {
    agent: RevisionResult | null;
    applied: Revision[];
    failure: RevisionFailure | null;
    plans: Array<{ revision: Revision; decision: RepairDecision }>;
    toApply: Revision[];
  },
): RevisionOutcome {
  const plan = plans.find((candidate) => candidate.revision.findingIds.includes(finding.id));
  const proposedPatch = plan ? toPatch(plan.revision) : null;
  const escalate = (escalationReason: string): RevisionOutcome => ({
    proposedPatch,
    status: "escalated",
    escalationReason,
    applied: false,
  });

  if (!plan) {
    const reason = agent?.unresolved.find((item) => item.findingId === finding.id)?.reason;

    return escalate(reason ? `The revision agent could not fix this: ${reason}` : "No automatic fix could be proposed.");
  }

  if (applied.includes(plan.revision)) {
    return { proposedPatch, status: "open", escalationReason: null, applied: true };
  }

  if (failure && toApply.includes(plan.revision)) {
    return escalate(
      failure.revision === plan.revision
        ? failure.message
        : "Not applied because another change in the same revision hit a concurrent edit.",
    );
  }

  if (plan.decision.action === "escalate") {
    return escalate(plan.decision.reason);
  }

  // The content cannot be written here; the change stays proposed.
  return { proposedPatch, status: null, escalationReason: null, applied: false };
}

function applyOutcome(finding: QaFinding, outcome: RevisionOutcome | undefined): QaFinding {
  if (!outcome) {
    return finding;
  }

  return {
    ...finding,
    proposedPatch: outcome.proposedPatch,
    proposalAttempted: true,
    status: outcome.status ?? finding.status,
    escalationReason: outcome.escalationReason ?? finding.escalationReason,
    repairAttempts: finding.repairAttempts + (outcome.applied ? 1 : 0),
  };
}

function toPatch(revision: Revision): QaPatchProposal {
  return {
    activityId: revision.activityId,
    fieldPath: revision.fieldPath,
    currentValue: revision.currentValue,
    proposedValue: revision.proposedValue,
    rationale: revision.rationale,
    protectedField: revision.protectedField,
  };
}

function updateFindings(
  run: StoredQaRun,
  ids: string[],
  update: (finding: QaFinding) => QaFinding,
): StoredQaRun {
  return {
    ...run,
    findings: run.findings.map((finding) => (ids.includes(finding.id) ? update(finding) : finding)),
  };
}

function notTestedOutput(
  evaluator: ScriptEvaluatorId,
  run: StoredQaRun,
  message: string,
): EvaluationOutput {
  const criteria = [...new Set(run.checks.filter((check) => check.evaluator === evaluator).map((check) => check.criterionId))];
  const fallback: Record<ScriptEvaluatorId, string[]> = {
    course_setup: [
      "setup.source-fidelity",
      "setup.objective-measurable",
      "setup.audience-grounded",
      "setup.scope-fit",
      "setup.title-clear",
    ],
    structural: ["structure.required-fields", "structure.no-placeholders", "structure.question-integrity"],
    alignment: ["alignment.objective-coverage", "pedagogy.audience-fit"],
    assessment: ["assessment.key-correct", "assessment.single-best-answer"],
    fidelity: ["accuracy.claims-supported"],
    consistency: ["consistency.cross-field"],
  };

  return {
    checks: (criteria.length > 0 ? criteria : fallback[evaluator]).map((criterionId) => ({
      criterionId,
      evaluator,
      activityId: null,
      status: "not_tested" as const,
      summary: `Check could not run: ${message}`,
    })),
    findings: [],
    usage: [],
  };
}

function usesModel(step: QaStep): boolean {
  return (
    (step.kind === "check" && step.evaluator !== "structural") ||
    step.kind === "revise" ||
    step.kind === "media_check"
  );
}

function describeStep(step: QaStep): string {
  switch (step.kind) {
    case "snapshot":
      return "Reading the lesson";
    case "check":
      return `Running ${step.evaluator} checks`;
    case "decide":
      return "Reviewing findings";
    case "revise":
      return "Revising the content";
    case "recheck":
      return "Re-checking revised content";
    case "video_request":
      return "Requesting video generation";
    case "video_poll":
      return "Waiting for video generation";
    case "media_check":
      return "Checking video narration";
    case "finalize":
      return "Finishing the run";
  }
}

function describeEvaluation(evaluator: string, output: EvaluationOutput): string {
  const failed = output.checks.filter((check) => check.status === "fail").length;
  const notTested = output.checks.filter((check) => check.status === "not_tested").length;

  return `${evaluator} checks: ${output.checks.length} result(s), ${failed} failed, ${notTested} not tested, ${output.findings.length} finding(s).`;
}

function describeChange(revision: Revision): string {
  return `${revision.fieldPath}${revision.activityId ? ` in ${revision.activityId}` : ""}`;
}

function versionNote(version: { versionNumber: number } | null): string {
  return version ? ` Recorded as content v${version.versionNumber}.` : "";
}

function describeFinding(finding: QaFinding): string {
  return `${finding.criterionId}${finding.activityId ? ` in ${finding.activityId}` : ""}`;
}

function auditRate(): number {
  const value = Number(process.env.QA_AUDIT_RATE);

  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}

async function logStep(
  step: QaStep,
  run: StoredQaRun,
  newEvents: StoredQaRun["events"],
  durationMs: number,
): Promise<void> {
  // Only this step's own timeline entry describes it; otherwise use its name.
  const latest = newEvents.at(-1);
  const finished = run.pendingSteps.length === 0;

  await logEvent({
    category: "qa",
    event: finished ? "qa.run.finished" : `qa.step.${step.kind}`,
    level: run.stage === "blocked" || run.stage === "error" ? "error" : latest?.level ?? "info",
    message: `${run.target === "course_setup" ? "Setup" : "Lesson"} QA — ${latest?.message ?? describeStep(step)}`,
    durationMs,
    data: {
      step: step.kind,
      stage: run.stage,
      findings: run.findings.length,
      blockingFindings: run.findings.filter(isUnresolvedBlocking).length,
      tokens: totalTokens(run.usage),
    },
  });
}
