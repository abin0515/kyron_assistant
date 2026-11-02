import "server-only";

import { getDatabase } from "@/server/db/client";
import {
  pageOffset,
  type PageRequest,
  type PageResult,
} from "@/server/http/pagination";
import type {
  DeleteDraftWorkspaceResult,
} from "@/server/drafts/workspaces/types";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  AssetType,
  DraftWorkspace,
  DraftWorkspaceStatus,
  DraftWorkspaceSummary,
  Duration,
  KyronDestination,
  UpdateDraftWorkspaceRequest,
} from "@/types/api";

type DraftWorkspaceRow = {
  id: string;
  status: DraftWorkspaceStatus;
  status_message: string;
  source_text: string;
  name: string;
  description: string;
  learning_objective: string;
  audience: string;
  asset_type: AssetType;
  duration_seconds: Duration;
  kyron_draft_id: string | number | null;
  kyron_asset_folder_id: string | number | null;
  kyron_asset_folder_path: unknown;
  submitted_at: string | Date | null;
  created_by_id: string;
  created_by_name: string;
  created_by_email: string;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

type DraftWorkspaceSummaryRow = Omit<
  DraftWorkspaceRow,
  | "source_text"
  | "description"
  | "learning_objective"
  | "audience"
  | "kyron_asset_folder_id"
  | "kyron_asset_folder_path"
  | "created_by_id"
  | "created_by_name"
  | "created_by_email"
>;

export async function createDraftWorkspace(
  id: string,
  user: CurrentUser,
): Promise<DraftWorkspace> {
  const sql = getDatabase();
  const rows = (await sql`
    INSERT INTO draft_workspaces (
      id,
      created_by_id,
      created_by_name,
      created_by_email
    )
    VALUES (
      ${id},
      ${user.id},
      ${user.name},
      ${user.email}
    )
    RETURNING *
  `) as DraftWorkspaceRow[];

  return toDraftWorkspace(rows[0]);
}

export async function getDraftWorkspaceById(
  id: string,
  userId: string,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT *
    FROM draft_workspaces
    WHERE id = ${id}
      AND created_by_id = ${userId}
    LIMIT 1
  `) as DraftWorkspaceRow[];

  return rows[0] ? toDraftWorkspace(rows[0]) : null;
}

// Used by background QA, which runs without a user session.
export async function findWorkspaceOwnerByKyronDraftId(
  kyronDraftId: number,
): Promise<{ workspaceId: string; ownerId: string } | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT id, created_by_id
    FROM draft_workspaces
    WHERE kyron_draft_id = ${kyronDraftId}
    LIMIT 1
  `) as Array<{ id: string; created_by_id: string }>;

  return rows[0] ? { workspaceId: rows[0].id, ownerId: rows[0].created_by_id } : null;
}

export async function updateDraftWorkspace(
  id: string,
  userId: string,
  input: UpdateDraftWorkspaceRequest,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const results = await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces
      SET
        source_text = COALESCE(${input.sourceText ?? null}, source_text),
        name = COALESCE(${input.name ?? null}, name),
        description = COALESCE(${input.description ?? null}, description),
        learning_objective = COALESCE(
          ${input.learningObjective ?? null},
          learning_objective
        ),
        audience = COALESCE(${input.audience ?? null}, audience),
        asset_type = COALESCE(
          ${input.assetType ?? null}::TEXT,
          asset_type
        ),
        duration_seconds = COALESCE(
          ${input.duration ?? null}::INTEGER,
          duration_seconds
        ),
        record_updated_at = NOW()
      WHERE id = ${id}
        AND created_by_id = ${userId}
        AND kyron_draft_id IS NULL
        AND status IN ('editing', 'error')
        AND NOT EXISTS (
          SELECT 1
          FROM course_setup_calibrations AS calibration
          WHERE calibration.workspace_id = draft_workspaces.id
            AND calibration.generation_token IS NOT NULL
        )
      RETURNING *
    `,
    transaction`
      WITH invalidated_calibration AS (
        UPDATE course_setup_calibrations AS calibration
        SET
          review_status = 'needs_review',
          review_result = NULL,
          reviewed_setup = NULL,
          reviewed_by_id = NULL,
          reviewed_by_name = NULL,
          reviewed_by_email = NULL,
          reviewed_at = NULL,
          record_updated_at = NOW()
        FROM draft_workspaces AS workspace
        WHERE calibration.workspace_id = workspace.id
          AND calibration.workspace_id = ${id}
          AND workspace.created_by_id = ${userId}
          AND workspace.kyron_draft_id IS NULL
          AND workspace.status IN ('editing', 'error')
          AND calibration.review_required = TRUE
          AND calibration.review_status = 'reviewed'
          AND calibration.reviewed_setup IS DISTINCT FROM JSONB_BUILD_OBJECT(
            'name', BTRIM(workspace.name),
            'description', BTRIM(workspace.description),
            'learningObjective', BTRIM(workspace.learning_objective),
            'audience', BTRIM(workspace.audience),
            'assetType', workspace.asset_type,
            'duration', workspace.duration_seconds
          )
        RETURNING calibration.workspace_id
      ),
      updated_batch_workspace AS (
        UPDATE draft_workspaces AS workspace
        SET
          setup_status = 'needs_review',
          setup_status_message = 'Course setup changed. Human review is required.',
          record_updated_at = NOW()
        FROM invalidated_calibration
        WHERE workspace.id = invalidated_calibration.workspace_id
          AND workspace.batch_id IS NOT NULL
        RETURNING workspace.batch_id
      )
      UPDATE draft_batches AS batch
      SET record_updated_at = NOW()
      WHERE batch.id IN (SELECT batch_id FROM updated_batch_workspace)
    `,
  ]);
  const updatedRows = results[0] as DraftWorkspaceRow[];
  const row = updatedRows[0];

  return row ? toDraftWorkspace(row) : null;
}

export async function updateDraftWorkspaceKyronDestination(
  id: string,
  userId: string,
  destination: KyronDestination,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const rows = (await sql`
    UPDATE draft_workspaces
    SET
      kyron_asset_folder_id = ${destination.folderId},
      kyron_asset_folder_path = ${JSON.stringify(destination.path)}::JSONB,
      record_updated_at = NOW()
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND kyron_draft_id IS NULL
      AND status IN ('editing', 'error')
    RETURNING *
  `) as DraftWorkspaceRow[];

  return rows[0] ? toDraftWorkspace(rows[0]) : null;
}

export async function deleteDraftWorkspace(
  id: string,
  userId: string,
): Promise<DeleteDraftWorkspaceResult> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH candidate AS MATERIALIZED (
      SELECT
        draft_workspaces.id,
        draft_workspaces.kyron_draft_id,
        (
          (
            draft_workspaces.kyron_draft_id IS NULL
            AND draft_workspaces.status IN ('editing', 'error')
          )
          OR drafts.kyron_availability = 'unavailable'
        ) AS deletable
      FROM draft_workspaces
      LEFT JOIN drafts
        ON drafts.kyron_draft_id = draft_workspaces.kyron_draft_id
        AND drafts.created_by_id = ${userId}
      WHERE draft_workspaces.id = ${id}
        AND draft_workspaces.created_by_id = ${userId}
    ),
    deleted_workspace AS (
      DELETE FROM draft_workspaces
      USING candidate
      WHERE draft_workspaces.id = candidate.id
        AND candidate.deletable
      RETURNING draft_workspaces.kyron_draft_id
    ),
    deleted_draft AS (
      DELETE FROM drafts
      USING deleted_workspace
      WHERE drafts.kyron_draft_id = deleted_workspace.kyron_draft_id
        AND drafts.created_by_id = ${userId}
      RETURNING drafts.kyron_draft_id
    )
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
        WHEN EXISTS (SELECT 1 FROM deleted_workspace) THEN 'deleted'
        ELSE 'not_allowed'
      END AS result,
      (SELECT COUNT(*) FROM deleted_draft) AS deleted_draft_count
  `) as Array<{
    result: DeleteDraftWorkspaceResult;
    deleted_draft_count: string | number;
  }>;

  return rows[0]?.result ?? "not_found";
}

export async function listDraftWorkspacesByUser(
  userId: string,
  page: PageRequest,
): Promise<PageResult<DraftWorkspaceSummary>> {
  const sql = getDatabase();
  const offset = pageOffset(page);
  const counts = (await sql`
    SELECT COUNT(*) AS total_count
    FROM draft_workspaces
    WHERE created_by_id = ${userId}
  `) as Array<{ total_count: string | number }>;
  const rows = (await sql`
    SELECT
      id,
      status,
      status_message,
      name,
      asset_type,
      duration_seconds,
      kyron_draft_id,
      submitted_at,
      record_created_at,
      record_updated_at
    FROM draft_workspaces
    WHERE created_by_id = ${userId}
    ORDER BY record_updated_at DESC
    LIMIT ${page.pageSize}
    OFFSET ${offset}
  `) as DraftWorkspaceSummaryRow[];

  return {
    items: rows.map(toDraftWorkspaceSummary),
    totalCount: Number(counts[0]?.total_count ?? 0),
  };
}

export async function startDraftWorkspaceSubmission(
  id: string,
  userId: string,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const rows = (await sql`
    UPDATE draft_workspaces
    SET
      status = 'submitting',
      status_message = 'Submitting draft to Kyron.',
      record_updated_at = NOW()
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND kyron_draft_id IS NULL
      AND status IN ('editing', 'error')
      AND NOT EXISTS (
        SELECT 1
        FROM course_setup_calibrations AS calibration
        WHERE calibration.workspace_id = draft_workspaces.id
          AND calibration.generation_token IS NOT NULL
      )
    RETURNING *
  `) as DraftWorkspaceRow[];

  return rows[0] ? toDraftWorkspace(rows[0]) : null;
}

export async function completeDraftWorkspaceSubmission(
  id: string,
  userId: string,
  kyronDraftId: number,
  statusMessage: string,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const rows = (await sql`
    UPDATE draft_workspaces
    SET
      status = 'submitted',
      status_message = ${statusMessage},
      kyron_draft_id = ${kyronDraftId},
      submitted_at = NOW(),
      record_updated_at = NOW()
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND status = 'submitting'
      AND kyron_draft_id IS NULL
    RETURNING *
  `) as DraftWorkspaceRow[];

  return rows[0] ? toDraftWorkspace(rows[0]) : null;
}

export async function failDraftWorkspaceSubmission(
  id: string,
  userId: string,
  statusMessage: string,
): Promise<void> {
  const sql = getDatabase();

  await sql`
    UPDATE draft_workspaces
    SET
      status = 'error',
      status_message = ${statusMessage},
      record_updated_at = NOW()
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND status = 'submitting'
      AND kyron_draft_id IS NULL
  `;
}

function toDraftWorkspace(row: DraftWorkspaceRow): DraftWorkspace {
  return {
    id: row.id,
    status: row.status,
    statusMessage: row.status_message,
    sourceText: row.source_text,
    name: row.name,
    description: row.description,
    learningObjective: row.learning_objective,
    audience: row.audience,
    assetType: row.asset_type,
    duration: Number(row.duration_seconds) as Duration,
    kyronDraftId: toNullableNumber(row.kyron_draft_id),
    kyronDestination: {
      folderId: toNullableNumber(row.kyron_asset_folder_id),
      path: toKyronFolderPath(row.kyron_asset_folder_path),
    },
    submittedAt: toNullableIsoString(row.submitted_at),
    courseSetupCalibration: null,
    createdBy: {
      id: row.created_by_id,
      name: row.created_by_name,
      email: row.created_by_email,
    },
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toDraftWorkspaceSummary(
  row: DraftWorkspaceSummaryRow,
): DraftWorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    assetType: row.asset_type,
    duration: Number(row.duration_seconds) as Duration,
    status: row.status,
    statusMessage: row.status_message,
    kyronDraftId: toNullableNumber(row.kyron_draft_id),
    submittedAt: toNullableIsoString(row.submitted_at),
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

function toNullableIsoString(
  value: string | Date | null,
): string | null {
  return value ? toIsoString(value) : null;
}

function toNullableNumber(
  value: string | number | null,
): number | null {
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
