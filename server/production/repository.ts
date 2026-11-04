import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabase } from "@/server/db/client";
import type { ProductionJob } from "@/types/api";

type JobRow = { data: ProductionJob };

export async function insertJobIfMissing(job: Omit<ProductionJob, "id">): Promise<void> {
  const id = randomUUID();

  await getDatabase()`
    INSERT INTO production_jobs (id, workspace_id, owner_id, stage, is_active, data)
    VALUES (
      ${id},
      ${job.workspaceId},
      ${job.ownerId},
      ${job.stage},
      TRUE,
      ${JSON.stringify({ ...job, id })}::JSONB
    )
    ON CONFLICT (workspace_id) DO NOTHING
  `;
}

export async function getJobByWorkspace(workspaceId: string): Promise<ProductionJob | null> {
  const rows = (await getDatabase()`
    SELECT data FROM production_jobs WHERE workspace_id = ${workspaceId}
  `) as JobRow[];

  return rows[0]?.data ?? null;
}

// Active jobs that have waited longest since their last update.
export async function listActiveJobs(limit: number): Promise<ProductionJob[]> {
  const rows = (await getDatabase()`
    SELECT data FROM production_jobs
    WHERE is_active
    ORDER BY record_updated_at
    LIMIT ${limit}
  `) as JobRow[];

  return rows.map((row) => row.data);
}

export async function listJobs(ownerId?: string): Promise<ProductionJob[]> {
  const rows = (await getDatabase()`
    SELECT data FROM production_jobs
    WHERE ${ownerId ?? null}::TEXT IS NULL OR owner_id = ${ownerId ?? null}
    ORDER BY record_created_at DESC
    LIMIT 200
  `) as JobRow[];

  return rows.map((row) => row.data);
}

export async function saveJob(job: ProductionJob, active: boolean): Promise<void> {
  await getDatabase()`
    UPDATE production_jobs
    SET
      stage = ${job.stage},
      is_active = ${active},
      data = ${JSON.stringify(job)}::JSONB,
      record_updated_at = NOW()
    WHERE id = ${job.id}
  `;
}

// Marks a job as looked at, so the scheduler rotates through all of them.
export async function touchJob(id: string): Promise<void> {
  await getDatabase()`
    UPDATE production_jobs SET record_updated_at = NOW() WHERE id = ${id}
  `;
}

// Courses that have QA records but no job yet, created before jobs existed.
export async function listWorkspacesWithoutJobs(
  limit: number,
): Promise<Array<{ workspaceId: string; ownerId: string; title: string }>> {
  const rows = (await getDatabase()`
    SELECT l.workspace_id, l.owner_id, l.data->>'title' AS title
    FROM qa_lessons l
    JOIN draft_workspaces w ON w.id = l.workspace_id
    LEFT JOIN production_jobs j ON j.workspace_id = l.workspace_id
    WHERE j.id IS NULL
    LIMIT ${limit}
  `) as Array<{ workspace_id: string; owner_id: string; title: string | null }>;

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    title: row.title ?? "Untitled draft",
  }));
}

export async function getWorkspaceCostUsd(workspaceId: string): Promise<number> {
  const rows = (await getDatabase()`
    SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost
    FROM llm_usage_events
    WHERE workspace_id = ${workspaceId}
  `) as Array<{ cost: string | number }>;

  return Number(rows[0]?.cost ?? 0);
}

export async function getDraftStatus(kyronDraftId: number): Promise<string | null> {
  const rows = (await getDatabase()`
    SELECT status FROM drafts WHERE kyron_draft_id = ${kyronDraftId}
  `) as Array<{ status: string }>;

  return rows[0]?.status ?? null;
}
