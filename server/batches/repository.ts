import "server-only";

import { getDatabase } from "@/server/db/client";
import type {
  BatchSetupStatus,
  DeleteDraftBatchResult,
} from "@/server/batches/types";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  AssetType,
  BatchWorkspaceItem,
  BatchWorkspaceStatus,
  DraftBatch,
  DraftStatus,
  DraftWorkspaceStatus,
  Duration,
  KyronAvailability,
  SourceFileType,
} from "@/types/api";

type BatchRow = {
  id: string;
  name: string;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

type BatchWorkspaceRow = {
  batch_id: string;
  id: string;
  workspace_status: DraftWorkspaceStatus;
  workspace_status_message: string;
  setup_status: BatchSetupStatus;
  setup_status_message: string;
  name: string;
  description: string;
  learning_objective: string;
  audience: string;
  asset_type: AssetType;
  duration_seconds: Duration;
  kyron_draft_id: string | number | null;
  record_updated_at: string | Date;
  source_file_id: string;
  source_file_name: string;
  source_file_size: string | number;
  source_file_type: SourceFileType;
  has_attachment: boolean;
  kyron_status: DraftStatus | null;
  kyron_status_message: string | null;
  kyron_availability: KyronAvailability | null;
};

export async function createBatchWithWorkspaces(
  batchId: string,
  name: string,
  user: CurrentUser,
  items: Array<{ workspaceId: string; sourceFileId: string }>,
): Promise<void> {
  const sql = getDatabase();

  await sql.transaction((transaction) => [
    transaction`
      INSERT INTO draft_batches (
        id,
        name,
        created_by_id,
        created_by_name,
        created_by_email
      )
      VALUES (
        ${batchId},
        ${name},
        ${user.id},
        ${user.name},
        ${user.email}
      )
    `,
    ...items.flatMap((item) => [
      transaction`
        INSERT INTO draft_workspaces (
          id,
          batch_id,
          setup_status,
          setup_status_message,
          created_by_id,
          created_by_name,
          created_by_email
        )
        VALUES (
          ${item.workspaceId},
          ${batchId},
          'pending',
          'Waiting to generate a course setup.',
          ${user.id},
          ${user.name},
          ${user.email}
        )
      `,
      transaction`
        INSERT INTO workspace_source_files (
          workspace_id,
          source_file_id,
          usage
        )
        VALUES (${item.workspaceId}, ${item.sourceFileId}, 'ai_input')
      `,
    ]),
  ]);
}

export async function listBatchesByUser(userId: string): Promise<DraftBatch[]> {
  const sql = getDatabase();
  const batches = (await sql`
    SELECT id, name, record_created_at, record_updated_at
    FROM draft_batches
    WHERE created_by_id = ${userId}
    ORDER BY record_updated_at DESC
    LIMIT 50
  `) as BatchRow[];

  if (batches.length === 0) {
    return [];
  }

  const workspaces = await listBatchWorkspaceRows(userId);
  const workspacesByBatch = new Map<string, BatchWorkspaceItem[]>();

  for (const row of workspaces) {
    const items = workspacesByBatch.get(row.batch_id) ?? [];
    items.push(toBatchWorkspace(row));
    workspacesByBatch.set(row.batch_id, items);
  }

  return batches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    createdAt: toIsoString(batch.record_created_at),
    updatedAt: toIsoString(batch.record_updated_at),
    workspaces: workspacesByBatch.get(batch.id) ?? [],
  }));
}

export async function getBatchById(
  id: string,
  userId: string,
): Promise<DraftBatch | null> {
  const sql = getDatabase();
  const batches = (await sql`
    SELECT id, name, record_created_at, record_updated_at
    FROM draft_batches
    WHERE id = ${id}
      AND created_by_id = ${userId}
    LIMIT 1
  `) as BatchRow[];
  const batch = batches[0];

  if (!batch) {
    return null;
  }

  const workspaces = await listBatchWorkspaceRows(userId, id);

  return {
    id: batch.id,
    name: batch.name,
    createdAt: toIsoString(batch.record_created_at),
    updatedAt: toIsoString(batch.record_updated_at),
    workspaces: workspaces.map(toBatchWorkspace),
  };
}

export async function claimBatchWorkspaceSetup(
  batchId: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const sql = getDatabase();
  const rows = (await sql`
    UPDATE draft_workspaces
    SET
      setup_status = 'generating',
      setup_status_message = 'Extracting the source and generating course fields.',
      record_updated_at = NOW()
    WHERE id = ${workspaceId}
      AND batch_id = ${batchId}
      AND created_by_id = ${userId}
      AND (
        setup_status IN ('pending', 'error')
        OR (
          setup_status = 'generating'
          AND record_updated_at < NOW() - INTERVAL '10 minutes'
        )
      )
    RETURNING id
  `) as Array<{ id: string }>;

  return Boolean(rows[0]);
}

export async function completeBatchWorkspaceSetup(
  batchId: string,
  workspaceId: string,
  userId: string,
  setup: BatchWorkspaceItem["setup"],
): Promise<void> {
  const sql = getDatabase();

  await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces
      SET
        name = ${setup.name},
        description = ${setup.description},
        learning_objective = ${setup.learningObjective},
        audience = ${setup.audience},
        asset_type = ${setup.assetType},
        duration_seconds = ${setup.duration},
        setup_status = 'needs_review',
        setup_status_message = 'AI suggestion generated. Human review is required.',
        record_updated_at = NOW()
      WHERE id = ${workspaceId}
        AND batch_id = ${batchId}
        AND created_by_id = ${userId}
        AND setup_status = 'generating'
    `,
    transaction`
      UPDATE draft_batches
      SET record_updated_at = NOW()
      WHERE id = ${batchId}
        AND created_by_id = ${userId}
    `,
  ]);
}

export async function failBatchWorkspaceSetup(
  batchId: string,
  workspaceId: string,
  userId: string,
  message: string,
): Promise<void> {
  const sql = getDatabase();

  await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces
      SET
        setup_status = 'error',
        setup_status_message = ${message},
        record_updated_at = NOW()
      WHERE id = ${workspaceId}
        AND batch_id = ${batchId}
        AND created_by_id = ${userId}
        AND setup_status = 'generating'
    `,
    transaction`
      UPDATE draft_batches
      SET record_updated_at = NOW()
      WHERE id = ${batchId}
        AND created_by_id = ${userId}
    `,
  ]);
}

export async function markBatchWorkspaceReviewed(
  batchId: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const sql = getDatabase();
  const rows = (await sql`
    UPDATE draft_workspaces
    SET
      setup_status = 'reviewed',
      setup_status_message = 'Course setup reviewed and ready to submit.',
      record_updated_at = NOW()
    WHERE id = ${workspaceId}
      AND batch_id = ${batchId}
      AND created_by_id = ${userId}
      AND setup_status IN ('needs_review', 'reviewed')
    RETURNING id
  `) as Array<{ id: string }>;

  if (rows[0]) {
    await sql`
      UPDATE draft_batches
      SET record_updated_at = NOW()
      WHERE id = ${batchId}
        AND created_by_id = ${userId}
    `;
  }

  return Boolean(rows[0]);
}

export async function deleteBatch(
  id: string,
  userId: string,
): Promise<DeleteDraftBatchResult> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH candidate AS MATERIALIZED (
      SELECT draft_batches.id
      FROM draft_batches
      WHERE draft_batches.id = ${id}
        AND draft_batches.created_by_id = ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM draft_workspaces
          LEFT JOIN drafts
            ON drafts.kyron_draft_id = draft_workspaces.kyron_draft_id
            AND drafts.created_by_id = ${userId}
          WHERE draft_workspaces.batch_id = draft_batches.id
            AND NOT (
              (
                draft_workspaces.kyron_draft_id IS NULL
                AND draft_workspaces.status IN ('editing', 'error')
              )
              OR drafts.kyron_availability = 'unavailable'
            )
        )
    ),
    deleted_drafts AS (
      DELETE FROM drafts
      WHERE drafts.created_by_id = ${userId}
        AND drafts.kyron_draft_id IN (
          SELECT draft_workspaces.kyron_draft_id
          FROM draft_workspaces
          JOIN candidate
            ON candidate.id = draft_workspaces.batch_id
          WHERE draft_workspaces.kyron_draft_id IS NOT NULL
        )
      RETURNING drafts.kyron_draft_id
    ),
    deleted_batch AS (
      DELETE FROM draft_batches
      USING candidate
      WHERE draft_batches.id = candidate.id
      RETURNING draft_batches.id
    )
    SELECT
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM draft_batches
          WHERE id = ${id} AND created_by_id = ${userId}
        ) AND NOT EXISTS (SELECT 1 FROM deleted_batch)
          THEN 'not_found'
        WHEN EXISTS (SELECT 1 FROM deleted_batch)
          THEN 'deleted'
        ELSE 'not_allowed'
      END AS result,
      (SELECT COUNT(*) FROM deleted_drafts) AS deleted_draft_count
  `) as Array<{
    result: DeleteDraftBatchResult;
    deleted_draft_count: string | number;
  }>;

  return rows[0]?.result ?? "not_found";
}

async function listBatchWorkspaceRows(
  userId: string,
  batchId?: string,
): Promise<BatchWorkspaceRow[]> {
  const sql = getDatabase();

  return (await sql`
    SELECT
      draft_workspaces.batch_id,
      draft_workspaces.id,
      draft_workspaces.status AS workspace_status,
      draft_workspaces.status_message AS workspace_status_message,
      draft_workspaces.setup_status,
      draft_workspaces.setup_status_message,
      draft_workspaces.name,
      draft_workspaces.description,
      draft_workspaces.learning_objective,
      draft_workspaces.audience,
      draft_workspaces.asset_type,
      draft_workspaces.duration_seconds,
      draft_workspaces.kyron_draft_id,
      draft_workspaces.record_updated_at,
      ai_source.source_file_id,
      ai_source.source_file_name,
      ai_source.source_file_size,
      ai_source.source_file_type,
      EXISTS (
        SELECT 1
        FROM workspace_source_files AS attachment
        WHERE attachment.workspace_id = draft_workspaces.id
          AND attachment.usage = 'kyron_attachment'
      ) AS has_attachment,
      drafts.status AS kyron_status,
      drafts.status_message AS kyron_status_message,
      drafts.kyron_availability
    FROM draft_workspaces
    JOIN LATERAL (
      SELECT
        source_files.id AS source_file_id,
        source_files.original_name AS source_file_name,
        source_files.byte_size AS source_file_size,
        CASE
          WHEN source_files.content_type = 'application/pdf' THEN 'pdf'
          WHEN source_files.content_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' THEN 'pptx'
          ELSE 'docx'
        END AS source_file_type
      FROM workspace_source_files
      JOIN source_files
        ON source_files.id = workspace_source_files.source_file_id
      WHERE workspace_source_files.workspace_id = draft_workspaces.id
        AND workspace_source_files.usage = 'ai_input'
      ORDER BY workspace_source_files.record_created_at
      LIMIT 1
    ) AS ai_source ON TRUE
    LEFT JOIN drafts
      ON drafts.kyron_draft_id = draft_workspaces.kyron_draft_id
      AND drafts.created_by_id = ${userId}
    WHERE draft_workspaces.created_by_id = ${userId}
      AND draft_workspaces.batch_id IS NOT NULL
      AND (${batchId ?? null}::UUID IS NULL OR draft_workspaces.batch_id = ${batchId ?? null}::UUID)
      AND draft_workspaces.batch_id IN (
        SELECT id
        FROM draft_batches
        WHERE created_by_id = ${userId}
        ORDER BY record_updated_at DESC
        LIMIT 50
      )
    ORDER BY draft_workspaces.record_updated_at DESC
  `) as BatchWorkspaceRow[];
}

function toBatchWorkspace(row: BatchWorkspaceRow): BatchWorkspaceItem {
  return {
    id: row.id,
    sourceFile: {
      id: row.source_file_id,
      name: row.source_file_name,
      size: Number(row.source_file_size),
      type: row.source_file_type,
    },
    status: toBatchWorkspaceStatus(row),
    statusMessage: toStatusMessage(row),
    setup: {
      name: row.name,
      description: row.description,
      learningObjective: row.learning_objective,
      audience: row.audience,
      assetType: row.asset_type,
      duration: Number(row.duration_seconds) as Duration,
    },
    attachToKyron: row.has_attachment,
    kyronDraftId: toNullableNumber(row.kyron_draft_id),
    updatedAt: toIsoString(row.record_updated_at),
  };
}

function toBatchWorkspaceStatus(row: BatchWorkspaceRow): BatchWorkspaceStatus {
  if (row.workspace_status === "submitting") {
    return "submitting";
  }

  if (row.workspace_status === "submitted") {
    if (
      row.kyron_availability === "unavailable" ||
      row.kyron_status === "error"
    ) {
      return "kyron_error";
    }

    return row.kyron_status === "done" ? "complete" : "generating";
  }

  if (row.setup_status === "generating") {
    return "setup_generating";
  }

  if (row.setup_status === "error") {
    return "setup_error";
  }

  if (row.setup_status === "needs_review") {
    return "needs_review";
  }

  if (row.setup_status === "reviewed") {
    return "ready";
  }

  return "setup_pending";
}

function toStatusMessage(row: BatchWorkspaceRow): string {
  if (row.workspace_status === "submitted") {
    return row.kyron_status_message || row.workspace_status_message;
  }

  return row.setup_status_message || row.workspace_status_message;
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

function toNullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}
