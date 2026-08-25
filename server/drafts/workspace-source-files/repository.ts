import "server-only";

import { getDatabase } from "@/server/db/client";
import type { WorkspaceSourceFile } from "@/server/drafts/workspace-source-files/types";
import type { SourceFileContentType } from "@/server/source-files/types";
import type { SourceFileUsagePurpose } from "@/types/api";

type WorkspaceSourceFileRow = {
  id: string;
  original_name: string;
  content_type: SourceFileContentType;
  byte_size: string | number;
  usage: SourceFileUsagePurpose;
  workspace_count: string | number;
  linked_at: string | Date;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

export async function listWorkspaceSourceFiles(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceSourceFile[]> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT
      source_files.id,
      source_files.original_name,
      source_files.content_type,
      source_files.byte_size,
      workspace_source_files.usage,
      workspace_source_files.record_created_at AS linked_at,
      source_files.record_created_at,
      source_files.record_updated_at,
      (
        SELECT COUNT(DISTINCT other_links.workspace_id)
        FROM workspace_source_files AS other_links
        WHERE other_links.source_file_id = source_files.id
      ) AS workspace_count
    FROM workspace_source_files
    INNER JOIN draft_workspaces
      ON draft_workspaces.id = workspace_source_files.workspace_id
    INNER JOIN source_files
      ON source_files.id = workspace_source_files.source_file_id
    WHERE workspace_source_files.workspace_id = ${workspaceId}
      AND draft_workspaces.created_by_id = ${userId}
      AND source_files.created_by_id = ${userId}
    ORDER BY workspace_source_files.record_created_at DESC
  `) as WorkspaceSourceFileRow[];

  return rows.map(toWorkspaceSourceFile);
}

export async function replaceWorkspaceSourceFiles(
  workspaceId: string,
  userId: string,
  purpose: SourceFileUsagePurpose,
  sourceFileIds: string[],
): Promise<void> {
  const sql = getDatabase();
  const queries = [
    sql`
      DELETE FROM workspace_source_files
      WHERE workspace_id = ${workspaceId}
        AND usage = ${purpose}
        AND EXISTS (
          SELECT 1
          FROM draft_workspaces
          WHERE draft_workspaces.id = workspace_source_files.workspace_id
            AND draft_workspaces.created_by_id = ${userId}
            AND draft_workspaces.kyron_draft_id IS NULL
            AND draft_workspaces.status IN ('editing', 'error')
        )
    `,
    ...sourceFileIds.map(
      (sourceFileId) => sql`
        INSERT INTO workspace_source_files (
          workspace_id,
          source_file_id,
          usage
        )
        SELECT
          draft_workspaces.id,
          source_files.id,
          ${purpose}
        FROM draft_workspaces
        CROSS JOIN source_files
        WHERE draft_workspaces.id = ${workspaceId}
          AND draft_workspaces.created_by_id = ${userId}
          AND draft_workspaces.kyron_draft_id IS NULL
          AND draft_workspaces.status IN ('editing', 'error')
          AND source_files.id = ${sourceFileId}
          AND source_files.created_by_id = ${userId}
        ON CONFLICT (workspace_id, source_file_id, usage) DO NOTHING
      `,
    ),
    sql`
      UPDATE draft_workspaces
      SET record_updated_at = NOW()
      WHERE id = ${workspaceId}
        AND created_by_id = ${userId}
        AND kyron_draft_id IS NULL
        AND status IN ('editing', 'error')
    `,
  ];

  await sql.transaction(queries);
}

function toWorkspaceSourceFile(
  row: WorkspaceSourceFileRow,
): WorkspaceSourceFile {
  return {
    id: row.id,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    purpose: row.usage,
    workspaceCount: Number(row.workspace_count),
    linkedAt: toIsoString(row.linked_at),
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}
