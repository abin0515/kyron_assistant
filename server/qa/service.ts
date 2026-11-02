import "server-only";

import { randomUUID } from "node:crypto";

import {
  findWorkspaceOwnerByKyronDraftId,
  getDraftWorkspaceById,
} from "@/server/drafts/workspaces/repository";
import { paginationMeta, type PageRequest } from "@/server/http/pagination";
import type { CurrentUser } from "@/server/identity/current-user";
import { logEvent } from "@/server/logging/writer";
import type {
  DraftWorkspace,
  QaAuditRequest,
  QaContentVersionDetail,
  QaContentVersionListResponse,
  QaDomain,
  QaDomainMetrics,
  QaEscalation,
  QaFindingDecisionRequest,
  QaHumanCheckRequest,
  QaLesson,
  QaMetricsResponse,
  QaRun,
  QaRunDetailResponse,
  QaRunSummary,
  QaSeverity,
  QaWorkspaceQaResponse,
} from "@/types/api";

import { getContentSource } from "./content-sources";
import { processNextStep, startQaRun } from "./pipeline";
import {
  findLessonByWorkspace,
  getContentVersion,
  getLatestWorkspaceRun,
  getLesson,
  getRun,
  getSnapshot,
  listContentVersions,
  listLessons,
  listRuns,
  saveLesson,
  saveMediaFile,
  saveSnapshot,
  updateRun,
} from "./repository";
import { getRubricPack, QA_DOMAINS } from "./rubrics";
import { appendEvent, isUnresolvedBlocking, totalTokens } from "./run-records";
import { buildSnapshot, hashPacket, parseLessonPacket } from "./snapshot";
import { MAX_TRANSCRIPTION_BYTES } from "./transcription";
import type { StoredQaRun } from "./types";
import { loadWorkspaceReferences } from "./workspace-references";

const MEDIA_EXTENSIONS = /\.(mp4|m4a|mp3|mpeg|mpga|wav|webm|ogg|flac)$/i;
const DEFAULT_DOMAIN: QaDomain = "cpe";
const BLOCKING_STAGES = new Set(["changes_proposed", "escalated", "blocked", "error"]);
const RUN_VERSION_HISTORY = 20;
// How long a generation or submission request keeps driving QA itself before
// leaving the rest to the worker or an open page.
export const INLINE_QA_BUDGET_MS = 120_000;

export class QaValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors[0] ?? "The request is invalid.");
    this.name = "QaValidationError";
    this.errors = errors;
  }
}

export class QaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaNotFoundError";
  }
}

export class QaConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaConflictError";
  }
}

export class QaSubmissionGateError extends Error {
  readonly reason: "checking" | "blocked";

  constructor(reason: "checking" | "blocked", message: string) {
    super(message);
    this.name = "QaSubmissionGateError";
    this.reason = reason;
  }
}

// Runtime step 1: after a course setup is generated, check it against the
// workspace's sources and apply safe fixes before anyone submits it.
export async function runSetupQaAfterGeneration({
  budgetMs = INLINE_QA_BUDGET_MS,
  ownerId,
  startedBy,
  workspaceId,
}: {
  budgetMs?: number;
  ownerId: string;
  startedBy: string;
  workspaceId: string;
}): Promise<StoredQaRun | null> {
  const run = await startSetupQa({ ownerId, startedBy, workspaceId });

  return run ? driveUntilSettled(run.id, budgetMs) : null;
}

// Runtime step 2: Kyron creation waits for a current, passing setup check.
// Unresolved blocking findings need an explicit, recorded override.
export async function assertSetupReadyForSubmission({
  override,
  user,
  workspace,
}: {
  override: boolean;
  user: CurrentUser;
  workspace: DraftWorkspace;
}): Promise<void> {
  const lesson = await ensureWorkspaceLesson(workspace);
  const currentHash = hashPacket(await getContentSource("workspace_setup").readLesson(lesson));
  let run = await getLatestWorkspaceRun(workspace.id, "course_setup");
  const checkedHash = run?.snapshotId ? (await getSnapshot(run.snapshotId))?.contentHash : null;

  if (!run || (run.pendingSteps.length === 0 && checkedHash !== currentHash)) {
    run = await startQaRun({
      createdBy: user.name,
      lesson,
      snapshot: null,
      source: "workspace_setup",
      target: "course_setup",
    });
  }

  const settled = await driveUntilSettled(run.id, INLINE_QA_BUDGET_MS);

  if (!settled || settled.pendingSteps.length > 0) {
    throw new QaSubmissionGateError(
      "checking",
      "Quality checks for the course setup are still running. Submit again in a moment.",
    );
  }

  if (!BLOCKING_STAGES.has(settled.stage)) {
    return;
  }

  if (!override) {
    throw new QaSubmissionGateError(
      "blocked",
      `Quality check: ${settled.stageMessage} Review the findings below, or submit anyway.`,
    );
  }

  await updateRun(settled.id, (current) =>
    appendEvent(current, "warn", `${user.name} submitted to Kyron with unresolved quality findings.`),
  );
  await logEvent({
    category: "qa",
    event: "qa.override",
    level: "warn",
    message: `${user.name} submitted "${workspace.name}" with unresolved setup findings (${settled.stage}).`,
    actorId: user.id,
    actorRole: user.role,
    qaRunId: settled.id,
    workspaceId: workspace.id,
  });
}

// Runtime step 3: when Kyron finishes generating, check the generated lesson.
export async function queueQaForCompletedDraft(draft: { id: number }): Promise<void> {
  const owner = await findWorkspaceOwnerByKyronDraftId(draft.id);

  if (!owner) {
    return;
  }

  const workspace = await getDraftWorkspaceById(owner.workspaceId, owner.ownerId);

  if (!workspace) {
    return;
  }

  const existing = await getLatestWorkspaceRun(workspace.id, "lesson");

  if (existing) {
    return;
  }

  const lesson = await ensureWorkspaceLesson(workspace);
  const run = await startQaRun({
    createdBy: "Course launcher",
    lesson,
    snapshot: null,
    source: "kyron_mcp",
    target: "lesson",
  });

  // Reading the lesson is quick; it reports right away if Kyron MCP is not ready.
  await processNextStep(run.id);
}

// Until Kyron MCP is mapped, the generated lesson content can be pasted on the
// workspace page. It is checked against the same workspace sources.
export async function importWorkspaceLessonContent({
  packet: value,
  user,
  workspaceId,
}: {
  packet: unknown;
  user: CurrentUser;
  workspaceId: string;
}): Promise<QaWorkspaceQaResponse> {
  const workspace = await requireOwnedWorkspace(workspaceId, user);

  if (!workspace.kyronDraftId) {
    throw new QaConflictError("Create the Kyron draft before checking its generated lesson.");
  }

  const parsed = parseLessonPacket(value);

  if (!parsed.ok) {
    throw new QaValidationError(parsed.errors);
  }

  const lesson = await ensureWorkspaceLesson(workspace);
  const references = await loadWorkspaceReferences({
    ownerId: workspace.createdBy.id,
    sourceText: workspace.sourceText,
    workspaceId: workspace.id,
  });
  const snapshot = await saveSnapshot(
    buildSnapshot({
      createdBy: user.name,
      lessonId: lesson.id,
      packet: { ...parsed.packet, references: [...references, ...parsed.packet.references] },
      source: "manual",
    }),
  );

  await startQaRun({ createdBy: user.name, lesson, snapshot, source: "manual", target: "lesson" });

  return getWorkspaceQa(workspaceId, user);
}

export async function startSetupQaForCurrentUser(
  workspaceId: string,
  user: CurrentUser,
): Promise<QaWorkspaceQaResponse> {
  const workspace = await requireOwnedWorkspace(workspaceId, user);

  if (workspace.kyronDraftId) {
    throw new QaConflictError("The course setup was already submitted to Kyron.");
  }

  await startSetupQa({ ownerId: workspace.createdBy.id, startedBy: user.name, workspaceId });

  return getWorkspaceQa(workspaceId, user);
}

export async function getWorkspaceQa(
  workspaceId: string,
  user: CurrentUser,
): Promise<QaWorkspaceQaResponse> {
  await requireOwnedWorkspace(workspaceId, user);

  const [setupRun, lessonRun] = await Promise.all([
    getLatestWorkspaceRun(workspaceId, "course_setup"),
    getLatestWorkspaceRun(workspaceId, "lesson"),
  ]);

  return {
    setup: setupRun ? await toDetail(setupRun) : null,
    lesson: lessonRun ? await toDetail(lessonRun) : null,
  };
}

export async function listRunSummaries(user: CurrentUser): Promise<QaRunSummary[]> {
  const ownerId = isTeamReviewer(user) ? undefined : user.id;
  const [runs, lessons] = await Promise.all([listRuns({ ownerId }), listLessons(ownerId)]);

  return runs.map((run) => ({
    id: run.id,
    target: run.target,
    stage: run.stage,
    stageMessage: run.stageMessage,
    domain: run.domain,
    workspaceId: run.workspaceId,
    title: lessons.find((lesson) => lesson.id === run.lessonId)?.title ?? "Untitled draft",
    blockingFindings: run.findings.filter(isUnresolvedBlocking).length,
    totalFindings: run.findings.length,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  }));
}

export async function getRunDetail(runId: string, user: CurrentUser): Promise<QaRunDetailResponse> {
  return toDetail(await requireVisibleRun(runId, user));
}

export async function advanceRun(runId: string, user: CurrentUser): Promise<QaRunDetailResponse> {
  await requireVisibleRun(runId, user);
  await processNextStep(runId);

  return getRunDetail(runId, user);
}

export async function rerunRun(runId: string, user: CurrentUser): Promise<QaRunDetailResponse> {
  const previous = await requireVisibleRun(runId, user);
  const lesson = await getLesson(previous.lessonId);

  if (!lesson) {
    throw new QaNotFoundError("The QA record for this run was not found.");
  }

  const snapshot =
    previous.source === "manual" && previous.snapshotId ? await getSnapshot(previous.snapshotId) : null;
  const run = await startQaRun({
    createdBy: user.name,
    lesson,
    snapshot,
    source: previous.source,
    target: previous.target,
  });

  return getRunDetail(run.id, user);
}

export async function decideFinding(
  runId: string,
  findingId: string,
  { outcome, reason }: QaFindingDecisionRequest,
  user: CurrentUser,
): Promise<QaRunDetailResponse> {
  const writable = getContentSource((await requireVisibleRun(runId, user)).source).writable;

  await updateRunOrThrow(runId, (run) => {
    const finding = run.findings.find((candidate) => candidate.id === findingId);

    if (!finding) {
      throw new QaNotFoundError("The finding was not found.");
    }

    const decided = {
      ...run,
      findings: run.findings.map((candidate) =>
        candidate.id === findingId
          ? {
              ...candidate,
              status: outcome,
              decision: { outcome, reason, decidedBy: user.name, decidedAt: new Date().toISOString() },
            }
          : candidate,
      ),
    };
    const applyNow = outcome === "accepted" && writable && finding.proposedPatch !== null;

    return appendEvent(
      queueSteps(decided, applyNow ? [{ kind: "revise" }, { kind: "recheck" }] : [{ kind: "finalize" }]),
      "info",
      `${user.name} ${outcome} ${finding.criterionId}${reason ? `: ${reason.replace(/[.\s]+$/, "")}` : ""}.`,
    );
  });

  return getRunDetail(runId, user);
}

export async function recordHumanCheck(
  runId: string,
  criterionId: string,
  { note, status }: QaHumanCheckRequest,
  user: CurrentUser,
): Promise<QaRunDetailResponse> {
  await requireVisibleRun(runId, user);
  await updateRunOrThrow(runId, (run) => {
    if (!run.humanChecks.some((check) => check.criterionId === criterionId)) {
      throw new QaNotFoundError("The human check was not found.");
    }

    return appendEvent(
      queueSteps(
        {
          ...run,
          humanChecks: run.humanChecks.map((check) =>
            check.criterionId === criterionId
              ? { ...check, status, note: note || null, decidedBy: user.name, decidedAt: new Date().toISOString() }
              : check,
          ),
        },
        [{ kind: "finalize" }],
      ),
      "info",
      `${user.name} recorded ${criterionId} as ${status}.`,
    );
  });

  return getRunDetail(runId, user);
}

export async function recordAudit(
  runId: string,
  { note, outcome }: QaAuditRequest,
  user: CurrentUser,
): Promise<QaRunDetailResponse> {
  await requireVisibleRun(runId, user);
  await updateRunOrThrow(runId, (run) =>
    appendEvent(
      {
        ...run,
        audit: {
          ...run.audit,
          required: true,
          sampledAt: run.audit.sampledAt ?? new Date().toISOString(),
          outcome,
          note: note || null,
          decidedBy: user.name,
          decidedAt: new Date().toISOString(),
        },
      },
      outcome === "pass" ? "info" : "warn",
      `${user.name} audited the run: ${outcome === "pass" ? "no defects" : "defect found"}.`,
    ),
  );

  return getRunDetail(runId, user);
}

export async function attachMedia(
  runId: string,
  file: { name: string; bytes: Uint8Array },
  user: CurrentUser,
): Promise<QaRunDetailResponse> {
  if (!MEDIA_EXTENSIONS.test(file.name)) {
    throw new QaValidationError(["Upload an mp4, m4a, mp3, wav, webm, ogg or flac file."]);
  }

  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
    throw new QaValidationError(["The file must be between 1 byte and 25 MB."]);
  }

  const run = await requireVisibleRun(runId, user);

  if (run.target !== "lesson" || !run.snapshotId) {
    throw new QaConflictError("Video checks need a generated-lesson run with lesson content.");
  }

  const filePath = await saveMediaFile(runId, file.name, file.bytes);

  await updateRunOrThrow(runId, (current) =>
    appendEvent(
      queueSteps(
        {
          ...current,
          mediaFilePath: filePath,
          media: {
            fileName: file.name,
            byteSize: file.bytes.byteLength,
            source: "upload",
            status: "pending",
            transcript: null,
            message: null,
          },
        },
        [{ kind: "media_check" }],
      ),
      "info",
      `Attached ${file.name} for a narration check.`,
    ),
  );

  return getRunDetail(runId, user);
}

// Every content version across the team, for the Logs page.
export async function getContentVersionPage(page: PageRequest): Promise<QaContentVersionListResponse> {
  const result = await listContentVersions({}, page);

  return { versions: result.items, pagination: paginationMeta(page, result.totalCount) };
}

export async function getContentVersionForUser(
  versionId: string,
  user: CurrentUser,
): Promise<QaContentVersionDetail> {
  const version = await getContentVersion(versionId);
  const lesson = version ? await getLesson(version.lessonId) : null;

  if (!version || !lesson || (!isTeamReviewer(user) && lesson.ownerId !== user.id)) {
    throw new QaNotFoundError("The content version was not found.");
  }

  return version;
}

export async function listEscalations(): Promise<QaEscalation[]> {
  const [runs, lessons] = await Promise.all([listRuns(), listLessons()]);

  return runs.flatMap((run) => {
    const lesson = lessons.find((candidate) => candidate.id === run.lessonId);

    return run.findings
      .filter((finding) => finding.status === "escalated")
      .map((finding) => ({
        runId: run.id,
        target: run.target,
        workspaceId: run.workspaceId,
        lessonTitle: lesson?.title ?? "Untitled draft",
        domain: run.domain,
        finding,
      }));
  });
}

export async function getQaMetrics(user: CurrentUser): Promise<QaMetricsResponse> {
  const ownerId = isTeamReviewer(user) ? undefined : user.id;
  const runs = await listRuns({ ownerId, limit: 1_000 });

  return {
    generatedAt: new Date().toISOString(),
    domains: QA_DOMAINS.map((domain) => domainMetrics(domain, runs.filter((run) => run.domain === domain))),
  };
}

export function toPublicRun(run: StoredQaRun): QaRun {
  return {
    id: run.id,
    lessonId: run.lessonId,
    workspaceId: run.workspaceId,
    ownerId: run.ownerId,
    target: run.target,
    snapshotId: run.snapshotId,
    domain: run.domain,
    rubricVersion: run.rubricVersion,
    rubricApproved: run.rubricApproved,
    source: run.source,
    stage: run.stage,
    stageMessage: run.stageMessage,
    checks: run.checks,
    findings: run.findings,
    humanChecks: run.humanChecks,
    media: run.media,
    events: run.events,
    usage: run.usage,
    usageByPurpose: run.usageByPurpose,
    tokenBudget: run.tokenBudget,
    audit: run.audit,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

async function startSetupQa({
  ownerId,
  startedBy,
  workspaceId,
}: {
  ownerId: string;
  startedBy: string;
  workspaceId: string;
}): Promise<StoredQaRun | null> {
  const workspace = await getDraftWorkspaceById(workspaceId, ownerId);

  if (!workspace || workspace.kyronDraftId) {
    return null;
  }

  const active = await getLatestWorkspaceRun(workspaceId, "course_setup");

  if (active && active.pendingSteps.length > 0) {
    return active;
  }

  return startQaRun({
    createdBy: startedBy,
    lesson: await ensureWorkspaceLesson(workspace),
    snapshot: null,
    source: "workspace_setup",
    target: "course_setup",
  });
}

async function driveUntilSettled(runId: string, budgetMs: number): Promise<StoredQaRun | null> {
  const deadline = Date.now() + budgetMs;
  let run = await getRun(runId);

  while (run && run.pendingSteps.length > 0 && Date.now() < deadline) {
    const advanced = await processNextStep(runId);

    if (!advanced) {
      // Another caller holds the lease; let it work briefly before looking again.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    run = await getRun(runId);
  }

  return run;
}

async function ensureWorkspaceLesson(workspace: DraftWorkspace): Promise<QaLesson> {
  const existing = await findLessonByWorkspace(workspace.id);
  const title = workspace.name.trim() || "Untitled draft";

  if (existing) {
    return existing.title === title && existing.kyronLessonId === workspace.kyronDraftId
      ? existing
      : saveLesson({ ...existing, title, kyronLessonId: workspace.kyronDraftId });
  }

  return saveLesson({
    id: randomUUID(),
    title,
    domain: DEFAULT_DOMAIN,
    workspaceId: workspace.id,
    ownerId: workspace.createdBy.id,
    kyronLessonId: workspace.kyronDraftId,
    createdAt: new Date().toISOString(),
    createdBy: workspace.createdBy.name,
    latestSnapshotId: null,
    latestRunId: null,
  });
}

async function toDetail(run: StoredQaRun): Promise<QaRunDetailResponse> {
  const [lesson, snapshot, rubric, versions] = await Promise.all([
    getLesson(run.lessonId),
    run.snapshotId ? getSnapshot(run.snapshotId) : Promise.resolve(null),
    getRubricPack(run.domain),
    listContentVersions(
      { lessonId: run.lessonId, target: run.target },
      { page: 1, pageSize: RUN_VERSION_HISTORY },
    ),
  ]);

  if (!lesson) {
    throw new QaNotFoundError("The QA record for this run was not found.");
  }

  return {
    run: toPublicRun(run),
    lesson,
    snapshot,
    contentWritable: getContentSource(run.source).writable,
    pendingStepCount: run.pendingSteps.length,
    criteria: rubric.criteria.filter((criterion) => criterion.target === run.target),
    versions: versions.items,
  };
}

async function requireOwnedWorkspace(workspaceId: string, user: CurrentUser): Promise<DraftWorkspace> {
  const workspace = await getDraftWorkspaceById(workspaceId, user.id);

  if (!workspace) {
    throw new QaNotFoundError("The draft workspace was not found.");
  }

  return workspace;
}

async function requireVisibleRun(runId: string, user: CurrentUser): Promise<StoredQaRun> {
  const run = await getRun(runId);

  if (!run || (!isTeamReviewer(user) && run.ownerId !== user.id)) {
    throw new QaNotFoundError("The QA run was not found.");
  }

  return run;
}

// Admins and developers review QA across the team; other users see their own.
function isTeamReviewer(user: CurrentUser): boolean {
  return user.role === "admin" || user.role === "developer";
}

function domainMetrics(domain: QaDomain, runs: StoredQaRun[]): QaDomainMetrics {
  const severities: Record<QaSeverity, number> = { critical: 0, major: 0, minor: 0 };
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const latest = latestRunPerWorkspaceTarget(runs);

  for (const run of runs) {
    usage.calls += run.usage.calls;
    usage.inputTokens += run.usage.inputTokens;
    usage.outputTokens += run.usage.outputTokens;
    usage.reasoningTokens += run.usage.reasoningTokens;

    for (const finding of run.findings) {
      severities[finding.severity] += 1;
    }
  }

  return {
    domain,
    lessons: new Set(runs.map((run) => run.lessonId)).size,
    runs: runs.length,
    runsByStage: latest.reduce<QaDomainMetrics["runsByStage"]>(
      (counts, run) => ({ ...counts, [run.stage]: (counts[run.stage] ?? 0) + 1 }),
      {},
    ),
    openBlockingFindings: latest.reduce(
      (count, run) => count + run.findings.filter(isUnresolvedBlocking).length,
      0,
    ),
    pendingEscalations: latest.reduce(
      (count, run) => count + run.findings.filter((finding) => finding.status === "escalated").length,
      0,
    ),
    findingsBySeverity: severities,
    rejectedFindings: runs.reduce(
      (count, run) => count + run.findings.filter((finding) => finding.status === "rejected").length,
      0,
    ),
    audits: {
      required: runs.filter((run) => run.audit.required).length,
      completed: runs.filter((run) => run.audit.outcome === "pass" || run.audit.outcome === "defect_found").length,
      defectsFound: runs.filter((run) => run.audit.outcome === "defect_found").length,
    },
    usage,
    averageTokensPerRun: runs.length === 0 ? 0 : Math.round(totalTokens(usage) / runs.length),
  };
}

function latestRunPerWorkspaceTarget(runs: StoredQaRun[]): StoredQaRun[] {
  const latest = new Map<string, StoredQaRun>();

  for (const run of runs) {
    const key = `${run.lessonId}:${run.target}`;
    const current = latest.get(key);

    if (!current || current.createdAt < run.createdAt) {
      latest.set(key, run);
    }
  }

  return [...latest.values()];
}

function queueSteps(run: StoredQaRun, steps: StoredQaRun["pendingSteps"]): StoredQaRun {
  const alreadyQueued = steps.every((step) =>
    run.pendingSteps.some((queued) => JSON.stringify(queued) === JSON.stringify(step)),
  );

  return alreadyQueued
    ? run
    : { ...run, pendingSteps: [...run.pendingSteps, ...steps], completedAt: null };
}

async function updateRunOrThrow(
  runId: string,
  mutate: (run: StoredQaRun) => StoredQaRun,
): Promise<StoredQaRun> {
  const updated = await updateRun(runId, mutate);

  if (!updated) {
    throw new QaNotFoundError("The QA run was not found.");
  }

  return updated;
}

