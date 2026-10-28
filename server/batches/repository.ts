import "server-only";

import { getDatabase } from "@/server/db/client";
import {
  pageOffset,
  type PageRequest,
  type PageResult,
} from "@/server/http/pagination";
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
  KyronDestination,
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
  kyron_asset_folder_id: string | number | null;
  kyron_asset_folder_path: unknown;
  record_updated_at: string | Date;
  source_file_id: string | null;
  source_file_name: string | null;
  source_file_size: string | number | null;
  source_file_type: SourceFileType | null;
  has_attachment: boolean;
  include_in_calibration: boolean;
  kyron_status: DraftStatus | null;
  kyron_status_message: string | null;
  kyron_availability: KyronAvailability | null;
};

export async function createBatchWithWorkspaces(
  batchId: string,
  name: string,
  user: CurrentUser,
  items: Array<{ workspaceId: string; sourceFileId: string }>,
  destination: KyronDestination,
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
          kyron_asset_folder_id,
          kyron_asset_folder_path,
          created_by_id,
          created_by_name,
          created_by_email
        )
        VALUES (
          ${item.workspaceId},
          ${batchId},
          'pending',
          'Waiting to generate a course setup.',
          ${destination.folderId},
          ${JSON.stringify(destination.path)}::JSONB,
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

export async function listBatchesByUser(
  userId: string,
  page: PageRequest,
): Promise<PageResult<DraftBatch>> {
  const sql = getDatabase();
  const offset = pageOffset(page);
  const counts = (await sql`
    SELECT COUNT(*) AS total_count
    FROM draft_batches
    WHERE created_by_id = ${userId}
  `) as Array<{ total_count: string | number }>;
  const batches = (await sql`
    SELECT id, name, record_created_at, record_updated_at
    FROM draft_batches
    WHERE created_by_id = ${userId}
    ORDER BY record_updated_at DESC
    LIMIT ${page.pageSize}
    OFFSET ${offset}
  `) as BatchRow[];

  if (batches.length === 0) {
    return {
      items: [],
      totalCount: Number(counts[0]?.total_count ?? 0),
    };
  }

  const workspaces = await listBatchWorkspaceRows(
    userId,
    undefined,
    batches.map((batch) => batch.id),
  );
  const workspacesByBatch = new Map<string, BatchWorkspaceItem[]>();

  for (const row of workspaces) {
    const items = workspacesByBatch.get(row.batch_id) ?? [];
    items.push(toBatchWorkspace(row));
    workspacesByBatch.set(row.batch_id, items);
  }

  return {
    items: batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      createdAt: toIsoString(batch.record_created_at),
      updatedAt: toIsoString(batch.record_updated_at),
      workspaces: workspacesByBatch.get(batch.id) ?? [],
    })),
    totalCount: Number(counts[0]?.total_count ?? 0),
  };
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

export async function deleteBatch(
  id: string,
  userId: string,
): Promise<DeleteDraftBatchResult> {
  const sql = getDatabase();
  const results = await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces
      SET
        batch_id = NULL,
        record_updated_at = NOW()
      WHERE batch_id IN (
        SELECT id
        FROM draft_batches
        WHERE id = ${id}
          AND created_by_id = ${userId}
      )
        AND created_by_id = ${userId}
        AND (
          status IN ('submitting', 'submitted')
          OR kyron_draft_id IS NOT NULL
        )
    `,
    transaction`
      DELETE FROM draft_batches
      WHERE id = ${id}
        AND created_by_id = ${userId}
      RETURNING id
    `,
  ]);
  const deletedBatches = results[1] as Array<{ id: string }>;

  return deletedBatches[0] ? "deleted" : "not_found";
}

async function listBatchWorkspaceRows(
  userId: string,
  batchId?: string,
  batchIds?: string[],
): Promise<BatchWorkspaceRow[]> {
  const sql = getDatabase();

  return (await sql.query(
    `
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
      draft_workspaces.kyron_asset_folder_id,
      draft_workspaces.kyron_asset_folder_path,
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
      COALESCE(
        course_setup_calibrations.include_in_calibration,
        FALSE
      ) AS include_in_calibration,
      drafts.status AS kyron_status,
      drafts.status_message AS kyron_status_message,
      drafts.kyron_availability
    FROM draft_workspaces
    LEFT JOIN LATERAL (
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
      AND drafts.created_by_id = $1
    LEFT JOIN course_setup_calibrations
      ON course_setup_calibrations.workspace_id = draft_workspaces.id
    WHERE draft_workspaces.created_by_id = $1
      AND draft_workspaces.batch_id IS NOT NULL
      AND ($2::UUID IS NULL OR draft_workspaces.batch_id = $2::UUID)
      AND (
        $3::UUID[] IS NULL
        OR draft_workspaces.batch_id = ANY($3::UUID[])
      )
      AND draft_workspaces.batch_id IN (
        SELECT id
        FROM draft_batches
        WHERE created_by_id = $1
      )
    ORDER BY draft_workspaces.record_updated_at DESC
    `,
    [userId, batchId ?? null, batchIds ?? null],
  )) as BatchWorkspaceRow[];
}

function toBatchWorkspace(row: BatchWorkspaceRow): BatchWorkspaceItem {
  return {
    id: row.id,
    sourceFile:
      row.source_file_id &&
      row.source_file_name &&
      row.source_file_size !== null &&
      row.source_file_type
        ? {
            id: row.source_file_id,
            name: row.source_file_name,
            size: Number(row.source_file_size),
            type: row.source_file_type,
          }
        : null,
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
    includeInCalibration: row.include_in_calibration,
    kyronDestination: {
      folderId: toNullableNumber(row.kyron_asset_folder_id),
      path: toKyronFolderPath(row.kyron_asset_folder_path),
    },
    kyronDraftId: toNullableNumber(row.kyron_draft_id),
    updatedAt: toIsoString(row.record_updated_at),
  };
}

function toBatchWorkspaceStatus(row: BatchWorkspaceRow): BatchWorkspaceStatus {
  if (row.workspace_status === "submitting") {
    return "submitting";
  }

  if (row.workspace_status === "error") {
    return "kyron_error";
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

  if (
    row.setup_status === "needs_review" ||
    row.setup_status === "reviewed"
  ) {
    return "ready";
  }

  return "setup_pending";
}

function toStatusMessage(row: BatchWorkspaceRow): string {
  if (row.workspace_status === "error") {
    return row.workspace_status_message || row.setup_status_message;
  }

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

function toKyronFolderPath(value: unknown): KyronDestination["path"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("id" in item) ||
      !("name" in item) ||
      typeof item.id !== "number" ||
      !Number.isSafeInteger(item.id) ||
      item.id <= 0 ||
      typeof item.name !== "string" ||
      !item.name
    ) {
      return [];
    }

    return [{ id: item.id, name: item.name }];
  });
}
