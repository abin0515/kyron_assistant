import "server-only";

import { getDraftWorkspaceById } from "@/server/drafts/workspaces/repository";
import type { CurrentUser } from "@/server/identity/current-user";
import { logEvent } from "@/server/logging/writer";
import { getLatestWorkspaceRun } from "@/server/qa/repository";
import type { StoredQaRun } from "@/server/qa/types";
import type { DraftWorkspace, ProductionJob, ProductionStage } from "@/types/api";

import {
  getDraftStatus,
  getJobByWorkspace,
  getWorkspaceCostUsd,
  insertJobIfMissing,
  listActiveJobs,
  listJobs,
  listWorkspacesWithoutJobs,
  saveJob,
  touchJob,
} from "./repository";

const DEFAULT_COURSE_BUDGET_USD = 1;
const SCHEDULER_BATCH_SIZE = 10;
const MAX_JOB_EVENTS = 100;

export type ProductionState = Pick<ProductionJob, "stage" | "stageMessage" | "needs">;

// One job per course. Created when its course setup is first checked, so
// single drafts and batches both enter the pipeline the same way.
export async function ensureProductionJob({
  ownerId,
  title,
  workspaceId,
}: {
  ownerId: string;
  title: string;
  workspaceId: string;
}): Promise<void> {
  const now = new Date().toISOString();

  await insertJobIfMissing({
    workspaceId,
    ownerId,
    title,
    stage: "setup",
    stageMessage: "Waiting for a course setup.",
    needs: [],
    kyronDraftId: null,
    setupRunId: null,
    lessonRunId: null,
    costUsd: 0,
    budgetUsd: courseBudgetUsd(),
    events: [{ at: now, stage: "setup", message: "Production job created." }],
    createdAt: now,
    updatedAt: now,
  });
}

// Scheduler tick: brings every active job up to date with its course's
// records and logs each stage change. Ready courses leave the active set.
export async function advanceProductionJobs(limit = SCHEDULER_BATCH_SIZE): Promise<number> {
  for (const missing of await listWorkspacesWithoutJobs(limit)) {
    await ensureProductionJob(missing);
  }

  let changed = 0;

  for (const job of await listActiveJobs(limit)) {
    const workspace = await getDraftWorkspaceById(job.workspaceId, job.ownerId);
    const [setupRun, lessonRun, costUsd] = await Promise.all([
      getLatestWorkspaceRun(job.workspaceId, "course_setup"),
      getLatestWorkspaceRun(job.workspaceId, "lesson"),
      getWorkspaceCostUsd(job.workspaceId),
    ]);
    const draftStatus = workspace?.kyronDraftId ? await getDraftStatus(workspace.kyronDraftId) : null;
    const state = productionStateFor({
      workspace,
      draftStatus,
      setupRun,
      lessonRun,
      costUsd,
      budgetUsd: job.budgetUsd,
    });
    const next: ProductionJob = {
      ...job,
      ...state,
      title: workspace?.name ?? job.title,
      kyronDraftId: workspace?.kyronDraftId ?? null,
      setupRunId: setupRun?.id ?? null,
      lessonRunId: lessonRun?.id ?? null,
      costUsd,
    };

    if (state.stage === job.stage && state.stageMessage === job.stageMessage) {
      await touchJob(job.id);
      continue;
    }

    const now = new Date().toISOString();

    await saveJob(
      {
        ...next,
        updatedAt: now,
        events: [...job.events, { at: now, stage: state.stage, message: state.stageMessage }].slice(-MAX_JOB_EVENTS),
      },
      state.stage !== "ready",
    );
    await logEvent({
      category: "qa",
      event: "production.stage",
      level: state.stage === "blocked" ? "warn" : "info",
      message: `${next.title}: ${state.stage} — ${state.stageMessage}`,
      workspaceId: job.workspaceId,
      kyronDraftId: next.kyronDraftId,
      data: { from: job.stage, to: state.stage, needs: state.needs, costUsd },
    });
    changed += 1;
  }

  return changed;
}

// Stops further model calls for a course once it has spent its budget.
export async function courseBudgetProblem(workspaceId: string): Promise<string | null> {
  const job = await getJobByWorkspace(workspaceId);

  if (!job) {
    return null;
  }

  const spent = await getWorkspaceCostUsd(workspaceId);

  return spent >= job.budgetUsd
    ? `This course reached its model budget ($${spent.toFixed(4)} of $${job.budgetUsd.toFixed(2)}). Raise QA_COURSE_BUDGET_USD to continue.`
    : null;
}

export async function listProductionJobs(user: CurrentUser): Promise<ProductionJob[]> {
  return listJobs(user.role === "admin" || user.role === "developer" ? undefined : user.id);
}

// Where a course stands, from its durable records: the workspace, its Kyron
// draft, its setup and lesson QA runs, and its model spend.
export function productionStateFor({
  budgetUsd,
  costUsd,
  draftStatus,
  lessonRun,
  setupRun,
  workspace,
}: {
  budgetUsd: number;
  costUsd: number;
  draftStatus: string | null;
  lessonRun: StoredQaRun | null;
  setupRun: StoredQaRun | null;
  workspace: DraftWorkspace | null;
}): ProductionState {
  if (!workspace) {
    return state("blocked", "The draft workspace no longer exists.");
  }

  if (costUsd >= budgetUsd) {
    return state("blocked", `Model budget reached ($${costUsd.toFixed(4)} of $${budgetUsd.toFixed(2)}).`, [
      "Raise QA_COURSE_BUDGET_USD or stop this course",
    ]);
  }

  if (!workspace.kyronDraftId) {
    return setupState(setupRun);
  }

  if (draftStatus === "error") {
    return state("blocked", "Kyron reported that generation failed.", ["Check the draft in Kyron Studio"]);
  }

  if (draftStatus === "started") {
    return state("generating", "Kyron is generating the lesson.");
  }

  return lessonState(lessonRun);
}

function setupState(run: StoredQaRun | null): ProductionState {
  if (!run) {
    return state("setup", "Waiting for a course setup.", ["Generate the course setup"]);
  }

  if (run.pendingSteps.length > 0) {
    return state("setup", "Checking and fixing the course setup.");
  }

  switch (run.stage) {
    case "passed":
      return state("setup", "Course setup passed; ready to create the Kyron draft.", ["Create the Kyron draft"]);
    case "escalated":
      return state("setup", "Course setup findings need a decision.", ["Decide the escalated setup findings"]);
    case "blocked":
    case "error":
      return state("blocked", run.stageMessage);
    default:
      return state("setup", run.stageMessage, ["Review the setup findings"]);
  }
}

function lessonState(run: StoredQaRun | null): ProductionState {
  if (!run) {
    return state("generating", "Waiting for the lesson check to start.");
  }

  if (run.pendingSteps.length > 0) {
    return run.stage === "video" || run.stage === "media_check"
      ? state("video", run.stageMessage)
      : state("lesson_qa", run.stageMessage);
  }

  const escalated = run.findings.filter((finding) => finding.status === "escalated").length;
  const humanPending = run.humanChecks.filter((check) => check.status === "pending").length;

  switch (run.stage) {
    case "verified":
      return state("ready", "Script, video and human checks passed.", ["Publish in Kyron when approved (never automatic)"]);
    case "passed":
      return state("review", run.stageMessage, [
        ...(run.media?.status === "checked" ? [] : ["Render and check the video"]),
        ...(humanPending > 0 ? [`Complete ${humanPending} human check(s)`] : []),
      ]);
    case "escalated":
      return state("review", run.stageMessage, [`Decide ${escalated} escalated finding(s)`]);
    case "changes_proposed":
      return state("review", run.stageMessage, ["Apply the proposed changes (no write access to this draft)"]);
    case "blocked":
    case "error":
      return state("blocked", run.stageMessage);
    default:
      return state("review", run.stageMessage, ["Review the lesson check"]);
  }
}

function state(stage: ProductionStage, stageMessage: string, needs: string[] = []): ProductionState {
  return { stage, stageMessage, needs };
}

function courseBudgetUsd(): number {
  const value = Number(process.env.QA_COURSE_BUDGET_USD);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_COURSE_BUDGET_USD;
}
