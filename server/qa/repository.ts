import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDatabase } from "@/server/db/client";
import { pageOffset, type PageRequest, type PageResult } from "@/server/http/pagination";
import type {
  QaContentVersion,
  QaContentVersionDetail,
  QaLesson,
  QaLessonSnapshot,
  QaRunTarget,
} from "@/types/api";

import type {
  ContentVersionFilter,
  NewContentVersion,
  QaRubricApproval,
  StoredQaRun,
} from "./types";

const LEASE_SECONDS = 300;
const MAX_UPDATE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

type RunRow = {
  data: Omit<StoredQaRun, "lease">;
  version: number;
  lease_token: string | null;
  lease_expires_at: string | Date | null;
};

type VersionRow = {
  id: string;
  lesson_id: string;
  lesson_title: string | null;
  target: QaRunTarget;
  version_number: number;
  parent_version_id: string | null;
  status: QaContentVersion["status"];
  source: QaContentVersion["source"];
  author: string;
  model: string | null;
  run_id: string | null;
  workspace_id: string | null;
  kyron_draft_id: string | number | null;
  content_hash: string;
  summary: string;
  changes: QaContentVersion["changes"];
  created_at: string | Date;
  total_count?: string | number;
};

type VersionDetailRow = VersionRow & { content: QaContentVersionDetail["content"] };

export type RunListFilter = {
  ownerId?: string;
  workspaceId?: string;
  target?: QaRunTarget;
  limit?: number;
};

export async function saveLesson(lesson: QaLesson): Promise<QaLesson> {
  const sql = getDatabase();

  await sql`
    INSERT INTO qa_lessons (id, workspace_id, kyron_draft_id, domain, owner_id, data)
    VALUES (
      ${lesson.id},
      ${lesson.workspaceId},
      ${lesson.kyronLessonId},
      ${lesson.domain},
      ${lesson.ownerId},
      ${JSON.stringify(lesson)}::JSONB
    )
    ON CONFLICT (id) DO UPDATE SET
      kyron_draft_id = EXCLUDED.kyron_draft_id,
      domain = EXCLUDED.domain,
      data = EXCLUDED.data,
      record_updated_at = NOW()
  `;

  return lesson;
}

export async function getLesson(id: string): Promise<QaLesson | null> {
  const rows = (await getDatabase()`
    SELECT data FROM qa_lessons WHERE id = ${id}
  `) as Array<{ data: QaLesson }>;

  return rows[0]?.data ?? null;
}

export async function findLessonByWorkspace(workspaceId: string): Promise<QaLesson | null> {
  const rows = (await getDatabase()`
    SELECT data FROM qa_lessons WHERE workspace_id = ${workspaceId}
  `) as Array<{ data: QaLesson }>;

  return rows[0]?.data ?? null;
}

export async function listLessons(ownerId?: string): Promise<QaLesson[]> {
  const rows = (await getDatabase()`
    SELECT data
    FROM qa_lessons
    WHERE ${ownerId ?? null}::TEXT IS NULL OR owner_id = ${ownerId ?? null}
    ORDER BY record_created_at DESC
  `) as Array<{ data: QaLesson }>;

  return rows.map((row) => row.data);
}

export async function updateLesson(
  id: string,
  mutate: (lesson: QaLesson) => QaLesson,
): Promise<QaLesson | null> {
  const lesson = await getLesson(id);

  return lesson ? saveLesson(mutate(lesson)) : null;
}

export async function saveSnapshot(snapshot: QaLessonSnapshot): Promise<QaLessonSnapshot> {
  await getDatabase()`
    INSERT INTO qa_snapshots (id, lesson_id, data)
    VALUES (${snapshot.id}, ${snapshot.lessonId}, ${JSON.stringify(snapshot)}::JSONB)
    ON CONFLICT (id) DO NOTHING
  `;

  return snapshot;
}

export async function getSnapshot(id: string): Promise<QaLessonSnapshot | null> {
  const rows = (await getDatabase()`
    SELECT data FROM qa_snapshots WHERE id = ${id}
  `) as Array<{ data: QaLessonSnapshot }>;

  return rows[0]?.data ?? null;
}

export async function saveRun(run: StoredQaRun): Promise<StoredQaRun> {
  await getDatabase()`
    INSERT INTO qa_runs (
      id, lesson_id, workspace_id, target, stage, owner_id,
      has_pending_steps, data
    )
    VALUES (
      ${run.id},
      ${run.lessonId},
      ${run.workspaceId},
      ${run.target},
      ${run.stage},
      ${run.ownerId},
      ${run.pendingSteps.length > 0},
      ${JSON.stringify(withoutLease(run))}::JSONB
    )
  `;

  return run;
}

export async function getRun(id: string): Promise<StoredQaRun | null> {
  const rows = (await getDatabase()`
    SELECT data, version, lease_token, lease_expires_at
    FROM qa_runs
    WHERE id = ${id}
  `) as RunRow[];

  return rows[0] ? toStoredRun(rows[0]) : null;
}

export async function listRuns({
  limit = 200,
  ownerId,
  target,
  workspaceId,
}: RunListFilter = {}): Promise<StoredQaRun[]> {
  const rows = (await getDatabase()`
    SELECT data, version, lease_token, lease_expires_at
    FROM qa_runs
    WHERE (${ownerId ?? null}::TEXT IS NULL OR owner_id = ${ownerId ?? null})
      AND (${workspaceId ?? null}::UUID IS NULL OR workspace_id = ${workspaceId ?? null})
      AND (${target ?? null}::TEXT IS NULL OR target = ${target ?? null})
    ORDER BY record_created_at DESC
    LIMIT ${limit}
  `) as RunRow[];

  return rows.map(toStoredRun);
}

export async function getLatestWorkspaceRun(
  workspaceId: string,
  target: QaRunTarget,
): Promise<StoredQaRun | null> {
  return (await listRuns({ workspaceId, target, limit: 1 }))[0] ?? null;
}

export async function listRunIdsWithPendingWork(limit: number): Promise<string[]> {
  const rows = (await getDatabase()`
    SELECT id
    FROM qa_runs
    WHERE has_pending_steps
      AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
    ORDER BY record_updated_at
    LIMIT ${limit}
  `) as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

// Read-modify-write with optimistic concurrency: if another request changed
// the run in between, the mutation is re-applied to the fresh record.
export async function updateRun(
  id: string,
  mutate: (run: StoredQaRun) => StoredQaRun | null | Promise<StoredQaRun | null>,
): Promise<StoredQaRun | null> {
  const sql = getDatabase();

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const rows = (await sql`
      SELECT data, version, lease_token, lease_expires_at
      FROM qa_runs
      WHERE id = ${id}
    `) as RunRow[];

    if (!rows[0]) {
      return null;
    }

    const next = await mutate(toStoredRun(rows[0]));

    if (!next) {
      return null;
    }

    const updated = { ...next, updatedAt: new Date().toISOString() };
    const written = (await sql`
      UPDATE qa_runs
      SET
        data = ${JSON.stringify(withoutLease(updated))}::JSONB,
        stage = ${updated.stage},
        has_pending_steps = ${updated.pendingSteps.length > 0},
        lease_token = ${updated.lease?.token ?? null},
        lease_expires_at = ${updated.lease ? new Date(updated.lease.expiresAt).toISOString() : null},
        version = version + 1,
        record_updated_at = NOW()
      WHERE id = ${id} AND version = ${rows[0].version}
      RETURNING id
    `) as Array<{ id: string }>;

    if (written.length > 0) {
      return updated;
    }
  }

  throw new Error("The QA run kept changing during an update. Try again.");
}

// Takes a lease on a run with pending work so only one caller (the worker or
// an open page) processes it at a time. Expired leases are reclaimed.
export async function claimRun(
  id: string,
): Promise<{ run: StoredQaRun; leaseToken: string } | null> {
  const leaseToken = randomUUID();
  const rows = (await getDatabase()`
    UPDATE qa_runs
    SET
      lease_token = ${leaseToken},
      lease_expires_at = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second'),
      version = version + 1
    WHERE id = ${id}
      AND has_pending_steps
      AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
    RETURNING data, version, lease_token, lease_expires_at
  `) as RunRow[];

  return rows[0] ? { run: toStoredRun(rows[0]), leaseToken } : null;
}

// waitMs keeps a lease on the run so no caller picks it up before then, for
// steps that wait on outside work such as a video render.
export async function releaseRun(
  id: string,
  leaseToken: string,
  mutate: (run: StoredQaRun) => StoredQaRun,
  waitMs = 0,
): Promise<StoredQaRun | null> {
  return updateRun(id, (run) =>
    run.lease?.token === leaseToken
      ? { ...mutate(run), lease: waitMs > 0 ? { token: randomUUID(), expiresAt: Date.now() + waitMs } : null }
      : null,
  );
}

export async function getRubricApproval(
  domain: string,
  version: string,
): Promise<QaRubricApproval | null> {
  const rows = (await getDatabase()`
    SELECT domain, version, approved_by, approved_at
    FROM qa_rubric_approvals
    WHERE domain = ${domain} AND version = ${version}
  `) as Array<{ domain: string; version: string; approved_by: string; approved_at: string | Date }>;
  const row = rows[0];

  return row
    ? {
        domain: row.domain,
        version: row.version,
        approvedBy: row.approved_by,
        approvedAt: new Date(row.approved_at).toISOString(),
      }
    : null;
}

export async function saveRubricApproval(approval: QaRubricApproval): Promise<QaRubricApproval> {
  await getDatabase()`
    INSERT INTO qa_rubric_approvals (domain, version, approved_by, approved_at)
    VALUES (${approval.domain}, ${approval.version}, ${approval.approvedBy}, ${approval.approvedAt})
    ON CONFLICT (domain, version) DO UPDATE SET
      approved_by = EXCLUDED.approved_by,
      approved_at = EXCLUDED.approved_at
  `;

  return approval;
}

// Numbers each lesson's versions in order. Two writers racing for the same
// number hit the unique constraint, and the loser takes the next one.
export async function insertContentVersion(
  version: NewContentVersion,
): Promise<QaContentVersionDetail> {
  const sql = getDatabase();
  const id = randomUUID();

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    try {
      const rows = (await sql`
        INSERT INTO qa_content_versions (
          id, lesson_id, target, version_number, parent_version_id, status, source,
          author, model, run_id, workspace_id, kyron_draft_id, content_hash, summary,
          changes, content
        )
        SELECT
          ${id}, ${version.lessonId}, ${version.target}, COALESCE(MAX(version_number), 0) + 1,
          ${version.parentVersionId}, ${version.status}, ${version.source}, ${version.author},
          ${version.model}, ${version.runId}, ${version.workspaceId}, ${version.kyronDraftId},
          ${version.contentHash}, ${version.summary}, ${JSON.stringify(version.changes)}::JSONB,
          ${JSON.stringify(version.content)}::JSONB
        FROM qa_content_versions
        WHERE lesson_id = ${version.lessonId} AND target = ${version.target}
        RETURNING version_number, created_at
      `) as Array<{ version_number: number; created_at: string | Date }>;
      const lesson = await getLesson(version.lessonId);

      return {
        ...version,
        id,
        lessonTitle: lesson?.title ?? "Untitled draft",
        versionNumber: rows[0].version_number,
        createdAt: new Date(rows[0].created_at).toISOString(),
      };
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) {
        throw error;
      }
    }
  }

  throw new Error("Could not number the content version. Try again.");
}

export async function getLatestAppliedVersion(
  lessonId: string,
  target: QaRunTarget,
): Promise<QaContentVersionDetail | null> {
  const rows = (await getDatabase()`
    SELECT v.*, l.data->>'title' AS lesson_title
    FROM qa_content_versions v
    LEFT JOIN qa_lessons l ON l.id = v.lesson_id
    WHERE v.lesson_id = ${lessonId} AND v.target = ${target} AND v.status = 'applied'
    ORDER BY v.version_number DESC
    LIMIT 1
  `) as VersionDetailRow[];

  return rows[0] ? toVersionDetail(rows[0]) : null;
}

export async function getContentVersion(id: string): Promise<QaContentVersionDetail | null> {
  const rows = (await getDatabase()`
    SELECT v.*, l.data->>'title' AS lesson_title
    FROM qa_content_versions v
    LEFT JOIN qa_lessons l ON l.id = v.lesson_id
    WHERE v.id = ${id}
  `) as VersionDetailRow[];

  return rows[0] ? toVersionDetail(rows[0]) : null;
}

// Lists versions without their full content, newest first.
export async function listContentVersions(
  { lessonId, target }: ContentVersionFilter,
  page: PageRequest,
): Promise<PageResult<QaContentVersion>> {
  const rows = (await getDatabase()`
    SELECT
      v.id, v.lesson_id, v.target, v.version_number, v.parent_version_id, v.status,
      v.source, v.author, v.model, v.run_id, v.workspace_id, v.kyron_draft_id,
      v.content_hash, v.summary, v.changes, v.created_at,
      l.data->>'title' AS lesson_title,
      COUNT(*) OVER () AS total_count
    FROM qa_content_versions v
    LEFT JOIN qa_lessons l ON l.id = v.lesson_id
    WHERE (${lessonId ?? null}::UUID IS NULL OR v.lesson_id = ${lessonId ?? null})
      AND (${target ?? null}::TEXT IS NULL OR v.target = ${target ?? null})
    ORDER BY v.created_at DESC, v.version_number DESC
    LIMIT ${page.pageSize} OFFSET ${pageOffset(page)}
  `) as VersionRow[];

  return { items: rows.map(toVersion), totalCount: Number(rows[0]?.total_count ?? 0) };
}

// Rendered videos stay on local disk; Vercel Blob is not configured for QA.
export async function saveMediaFile(
  runId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const safeName = fileName.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(-120) || "media";
  const filePath = path.join(/*turbopackIgnore: true*/ mediaDirectory(), runId, safeName);

  await mkdir(/*turbopackIgnore: true*/ path.dirname(/*turbopackIgnore: true*/ filePath), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ filePath, bytes);

  return filePath;
}

export async function readMediaFile(filePath: string): Promise<Buffer> {
  const root = path.resolve(/*turbopackIgnore: true*/ mediaDirectory());

  if (!path.resolve(/*turbopackIgnore: true*/ filePath).startsWith(root)) {
    throw new Error("Media file is outside the QA media directory.");
  }

  return readFile(/*turbopackIgnore: true*/ filePath);
}

function mediaDirectory(): string {
  return (
    process.env.QA_DATA_DIR?.trim() ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "qa", "media")
  );
}

function toStoredRun(row: RunRow): StoredQaRun {
  const expiresAt = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : null;

  return {
    ...row.data,
    lease:
      row.lease_token && expiresAt !== null
        ? { token: row.lease_token, expiresAt }
        : null,
  };
}

function toVersion(row: VersionRow): QaContentVersion {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title ?? "Untitled draft",
    target: row.target,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id,
    status: row.status,
    source: row.source,
    author: row.author,
    model: row.model,
    runId: row.run_id,
    workspaceId: row.workspace_id,
    kyronDraftId: row.kyron_draft_id === null ? null : Number(row.kyron_draft_id),
    contentHash: row.content_hash,
    summary: row.summary,
    changes: row.changes ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toVersionDetail(row: VersionDetailRow): QaContentVersionDetail {
  return { ...toVersion(row), content: row.content };
}

function withoutLease(run: StoredQaRun): Omit<StoredQaRun, "lease"> {
  const data: Partial<StoredQaRun> = { ...run };

  // The lease lives in its own columns so claims can be atomic.
  delete data.lease;

  return data as Omit<StoredQaRun, "lease">;
}
