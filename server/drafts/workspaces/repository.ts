import "server-only";

import { getDatabase } from "@/server/db/client";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  AssetType,
  DraftWorkspace,
  DraftWorkspaceStatus,
  DraftWorkspaceSummary,
  Duration,
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

export async function updateDraftWorkspace(
  id: string,
  userId: string,
  input: UpdateDraftWorkspaceRequest,
): Promise<DraftWorkspace | null> {
  const sql = getDatabase();
  const rows = (await sql`
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
    RETURNING *
  `) as DraftWorkspaceRow[];

  return rows[0] ? toDraftWorkspace(rows[0]) : null;
}

export async function deleteDraftWorkspace(
  id: string,
  userId: string,
): Promise<boolean> {
  const sql = getDatabase();
  const rows = (await sql`
    DELETE FROM draft_workspaces
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND kyron_draft_id IS NULL
      AND status IN ('editing', 'error')
    RETURNING id
  `) as Array<{ id: string }>;

  return rows.length === 1;
}

export async function listDraftWorkspacesByUser(
  userId: string,
): Promise<DraftWorkspaceSummary[]> {
  const sql = getDatabase();
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
    LIMIT 50
  `) as DraftWorkspaceSummaryRow[];

  return rows.map(toDraftWorkspaceSummary);
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
    submittedAt: toNullableIsoString(row.submitted_at),
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
