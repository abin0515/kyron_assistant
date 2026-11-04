import "server-only";

import { getDatabase } from "@/server/db/client";
import type { StoredDraft } from "@/server/drafts/kyron-drafts/types";
import {
  pageOffset,
  type PageRequest,
  type PageResult,
} from "@/server/http/pagination";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  AssetType,
  Draft,
  KyronAvailability,
} from "@/types/api";

type DraftRow = {
  kyron_draft_id: string | number;
  name: string;
  asset_type: AssetType;
  status: Draft["status"];
  status_message: string;
  preview_url: string;
  editor_url: string;
  kyron_created_at: string | Date;
  kyron_updated_at: string | Date;
  kyron_availability: KyronAvailability;
  kyron_checked_at: string | Date | null;
  created_by_id: string;
  created_by_name: string;
  created_by_email: string;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

function toStoredDraft(row: DraftRow): StoredDraft {
  return {
    id: Number(row.kyron_draft_id),
    name: row.name,
    assetType: row.asset_type,
    status: row.status,
    statusMessage: row.status_message,
    previewUrl: row.preview_url,
    editorUrl: row.editor_url,
    createdAt: toIsoString(row.kyron_created_at),
    updatedAt: toIsoString(row.kyron_updated_at),
    kyronAvailability: row.kyron_availability,
    kyronCheckedAt: row.kyron_checked_at
      ? toIsoString(row.kyron_checked_at)
      : null,
    createdBy: {
      id: row.created_by_id,
      name: row.created_by_name,
      email: row.created_by_email,
    },
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

export async function saveDraft(
  draft: Draft,
  user: CurrentUser,
  assetType?: AssetType,
): Promise<void> {
  const sql = getDatabase();

  await sql`
    INSERT INTO drafts (
      kyron_draft_id,
      name,
      asset_type,
      status,
      status_message,
      preview_url,
      editor_url,
      kyron_created_at,
      kyron_updated_at,
      kyron_availability,
      kyron_checked_at,
      created_by_id,
      created_by_name,
      created_by_email
    )
    VALUES (
      ${draft.id},
      ${draft.name},
      ${assetType ?? "lesson"},
      ${draft.status},
      ${draft.statusMessage},
      ${draft.previewUrl},
      ${draft.editorUrl},
      ${draft.createdAt},
      ${draft.updatedAt},
      ${"available"},
      NOW(),
      ${user.id},
      ${user.name},
      ${user.email}
    )
    ON CONFLICT (kyron_draft_id) DO UPDATE SET
      name = EXCLUDED.name,
      asset_type = COALESCE(
        ${assetType ?? null}::TEXT,
        drafts.asset_type
      ),
      status = EXCLUDED.status,
      status_message = EXCLUDED.status_message,
      preview_url = EXCLUDED.preview_url,
      editor_url = EXCLUDED.editor_url,
      kyron_updated_at = EXCLUDED.kyron_updated_at,
      kyron_availability = EXCLUDED.kyron_availability,
      kyron_checked_at = EXCLUDED.kyron_checked_at,
      record_updated_at = NOW()
  `;
}

async function updateDraftAvailability(
  draftId: number,
  userId: string,
  availability: "unavailable" | "unknown",
): Promise<void> {
  const sql = getDatabase();

  await sql`
    UPDATE drafts
    SET
      kyron_availability = ${availability},
      kyron_checked_at = NOW(),
      record_updated_at = NOW()
    WHERE kyron_draft_id = ${draftId}
      AND created_by_id = ${userId}
  `;
}

export async function markDraftUnavailable(
  draftId: number,
  userId: string,
): Promise<void> {
  return updateDraftAvailability(draftId, userId, "unavailable");
}

export async function markDraftAvailabilityUnknown(
  draftId: number,
  userId: string,
): Promise<void> {
  return updateDraftAvailability(draftId, userId, "unknown");
}

export async function listDraftsByUser(
  userId: string,
  page: PageRequest,
): Promise<PageResult<StoredDraft>> {
  const sql = getDatabase();
  const offset = pageOffset(page);
  const counts = (await sql`
    SELECT COUNT(*) AS total_count
    FROM drafts
    WHERE created_by_id = ${userId}
  `) as Array<{ total_count: string | number }>;
  const rows = (await sql`
    SELECT
      kyron_draft_id,
      name,
      asset_type,
      status,
      status_message,
      preview_url,
      editor_url,
      kyron_created_at,
      kyron_updated_at,
      kyron_availability,
      kyron_checked_at,
      created_by_id,
      created_by_name,
      created_by_email,
      record_created_at,
      record_updated_at
    FROM drafts
    WHERE created_by_id = ${userId}
    ORDER BY record_created_at DESC
    LIMIT ${page.pageSize}
    OFFSET ${offset}
  `) as DraftRow[];

  return {
    items: rows.map(toStoredDraft),
    totalCount: Number(counts[0]?.total_count ?? 0),
  };
}

export async function listDraftsByIds(
  userId: string,
  draftIds: number[],
): Promise<StoredDraft[]> {
  if (draftIds.length === 0) {
    return [];
  }

  const sql = getDatabase();
  const rows = (await sql.query(
    `
      SELECT
        kyron_draft_id,
        name,
        asset_type,
        status,
        status_message,
        preview_url,
        editor_url,
        kyron_created_at,
        kyron_updated_at,
        kyron_availability,
        kyron_checked_at,
        created_by_id,
        created_by_name,
        created_by_email,
        record_created_at,
        record_updated_at
      FROM drafts
      WHERE created_by_id = $1
        AND kyron_draft_id = ANY($2::BIGINT[])
    `,
    [userId, draftIds],
  )) as DraftRow[];

  return rows.map(toStoredDraft);
}

// Drafts Kyron is still generating, for every owner, least recently checked
// first. Used by the server-side status poller.
export async function listGeneratingDrafts(limit: number, minAgeSeconds: number): Promise<StoredDraft[]> {
  const rows = (await getDatabase()`
    SELECT
      kyron_draft_id,
      name,
      asset_type,
      status,
      status_message,
      preview_url,
      editor_url,
      kyron_created_at,
      kyron_updated_at,
      kyron_availability,
      kyron_checked_at,
      created_by_id,
      created_by_name,
      created_by_email,
      record_created_at,
      record_updated_at
    FROM drafts
    WHERE status = 'started'
      AND kyron_availability <> 'unavailable'
      AND (kyron_checked_at IS NULL OR kyron_checked_at < NOW() - (${minAgeSeconds} * INTERVAL '1 second'))
    ORDER BY kyron_checked_at ASC NULLS FIRST
    LIMIT ${limit}
  `) as DraftRow[];

  return rows.map(toStoredDraft);
}

export async function listDraftsForSynchronization(
  userId: string,
  generatingOnly: boolean,
  limit = 50,
): Promise<StoredDraft[]> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT
      kyron_draft_id,
      name,
      asset_type,
      status,
      status_message,
      preview_url,
      editor_url,
      kyron_created_at,
      kyron_updated_at,
      kyron_availability,
      kyron_checked_at,
      created_by_id,
      created_by_name,
      created_by_email,
      record_created_at,
      record_updated_at
    FROM drafts
    WHERE created_by_id = ${userId}
      AND kyron_availability <> 'unavailable'
      AND (${generatingOnly} = FALSE OR status = 'started')
    ORDER BY kyron_checked_at ASC NULLS FIRST
    LIMIT ${limit}
  `) as DraftRow[];

  return rows.map(toStoredDraft);
}
