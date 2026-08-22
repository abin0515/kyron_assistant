import "server-only";

import { getDatabase } from "@/server/db/client";
import type {
  CreateSourceFileInput,
  CreateSourceFileUploadSessionInput,
  SourceFile,
  SourceFileContentType,
  SourceFileProcessingStatus,
  SourceFileSummary,
  SourceFileUploadSession,
  SourceFileUploadStatus,
  SourceFileUsage,
  SourceFileUsagePurpose,
} from "@/server/source-files/types";

type SourceFileRow = {
  id: string;
  original_name: string;
  blob_pathname: string;
  blob_url: string;
  content_type: SourceFileContentType;
  byte_size: string | number;
  checksum_md5_base64: string | null;
  processing_status: SourceFileProcessingStatus;
  status_message: string;
  created_by_id: string;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

type SourceFileSummaryRow = Pick<
  SourceFileRow,
  | "id"
  | "original_name"
  | "content_type"
  | "byte_size"
  | "processing_status"
  | "status_message"
  | "record_created_at"
  | "record_updated_at"
> & {
  workspace_count: string | number;
};

type SourceFileUsageRow = {
  workspace_id: string;
  workspace_name: string;
  usage: SourceFileUsagePurpose;
  record_created_at: string | Date;
};

type SourceFileUploadSessionRow = {
  id: string;
  original_name: string;
  blob_pathname: string;
  content_type: SourceFileContentType;
  declared_byte_size: string | number;
  status: SourceFileUploadStatus;
  created_by_id: string;
  expires_at: string | Date;
  completed_at: string | Date | null;
  record_created_at: string | Date;
  record_updated_at: string | Date;
};

export async function createSourceFileUploadSession(
  id: string,
  userId: string,
  input: CreateSourceFileUploadSessionInput,
): Promise<SourceFileUploadSession> {
  const sql = getDatabase();
  const rows = (await sql`
    INSERT INTO source_file_uploads (
      id,
      original_name,
      blob_pathname,
      content_type,
      declared_byte_size,
      created_by_id,
      expires_at
    )
    VALUES (
      ${id},
      ${input.originalName},
      ${input.blobPathname},
      ${input.contentType},
      ${input.declaredByteSize},
      ${userId},
      ${input.expiresAt}
    )
    RETURNING *
  `) as SourceFileUploadSessionRow[];

  return toSourceFileUploadSession(rows[0]);
}

export async function expirePendingSourceFileUploads(
  originalName: string,
  userId: string,
): Promise<void> {
  const sql = getDatabase();

  await sql`
    UPDATE source_file_uploads
    SET
      status = 'expired',
      record_updated_at = NOW()
    WHERE created_by_id = ${userId}
      AND normalized_name = LOWER(BTRIM(${originalName}))
      AND status = 'pending'
      AND expires_at <= NOW()
  `;
}

export async function getPendingSourceFileUploadByName(
  originalName: string,
  userId: string,
): Promise<SourceFileUploadSession | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT *
    FROM source_file_uploads
    WHERE created_by_id = ${userId}
      AND normalized_name = LOWER(BTRIM(${originalName}))
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1
  `) as SourceFileUploadSessionRow[];

  return rows[0] ? toSourceFileUploadSession(rows[0]) : null;
}

export async function getSourceFileUploadSessionById(
  id: string,
  userId: string,
): Promise<SourceFileUploadSession | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT *
    FROM source_file_uploads
    WHERE id = ${id}
      AND created_by_id = ${userId}
    LIMIT 1
  `) as SourceFileUploadSessionRow[];

  return rows[0] ? toSourceFileUploadSession(rows[0]) : null;
}

export async function finalizeSourceFileUploadSession(
  id: string,
  userId: string,
  input: CreateSourceFileInput,
): Promise<SourceFile | null> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH saved_file AS (
      INSERT INTO source_files (
        id,
        original_name,
        blob_pathname,
        blob_url,
        content_type,
        byte_size,
        checksum_md5_base64,
        created_by_id
      )
      SELECT
        source_file_uploads.id,
        source_file_uploads.original_name,
        source_file_uploads.blob_pathname,
        ${input.blobUrl},
        source_file_uploads.content_type,
        ${input.byteSize},
        ${input.checksumMd5Base64},
        source_file_uploads.created_by_id
      FROM source_file_uploads
      WHERE source_file_uploads.id = ${id}
        AND source_file_uploads.created_by_id = ${userId}
        AND source_file_uploads.blob_pathname = ${input.blobPathname}
        AND source_file_uploads.status IN ('pending', 'completed')
      ON CONFLICT (id) DO UPDATE
      SET record_updated_at = source_files.record_updated_at
      RETURNING source_files.*
    ),
    completed_upload AS (
      UPDATE source_file_uploads
      SET
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        record_updated_at = NOW()
      WHERE id IN (SELECT id FROM saved_file)
      RETURNING id
    )
    SELECT saved_file.*
    FROM saved_file
    INNER JOIN completed_upload ON completed_upload.id = saved_file.id
  `) as SourceFileRow[];

  return rows[0] ? toSourceFile(rows[0]) : null;
}

export async function getSourceFileById(
  id: string,
  userId: string,
): Promise<SourceFile | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT *
    FROM source_files
    WHERE id = ${id}
      AND created_by_id = ${userId}
    LIMIT 1
  `) as SourceFileRow[];

  return rows[0] ? toSourceFile(rows[0]) : null;
}

export async function getSourceFileByName(
  originalName: string,
  userId: string,
): Promise<SourceFile | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT *
    FROM source_files
    WHERE created_by_id = ${userId}
      AND normalized_name = LOWER(BTRIM(${originalName}))
    LIMIT 1
  `) as SourceFileRow[];

  return rows[0] ? toSourceFile(rows[0]) : null;
}

export async function listSourceFilesByUser(
  userId: string,
): Promise<SourceFileSummary[]> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT
      source_files.id,
      source_files.original_name,
      source_files.content_type,
      source_files.byte_size,
      source_files.processing_status,
      source_files.status_message,
      source_files.record_created_at,
      source_files.record_updated_at,
      COUNT(DISTINCT workspace_source_files.workspace_id) AS workspace_count
    FROM source_files
    LEFT JOIN workspace_source_files
      ON workspace_source_files.source_file_id = source_files.id
    WHERE source_files.created_by_id = ${userId}
    GROUP BY source_files.id
    ORDER BY source_files.record_created_at DESC
  `) as SourceFileSummaryRow[];

  return rows.map(toSourceFileSummary);
}

export async function listSourceFileUsages(
  sourceFileId: string,
  userId: string,
): Promise<SourceFileUsage[]> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT
      draft_workspaces.id AS workspace_id,
      draft_workspaces.name AS workspace_name,
      workspace_source_files.usage,
      workspace_source_files.record_created_at
    FROM workspace_source_files
    INNER JOIN source_files
      ON source_files.id = workspace_source_files.source_file_id
    INNER JOIN draft_workspaces
      ON draft_workspaces.id = workspace_source_files.workspace_id
    WHERE source_files.id = ${sourceFileId}
      AND source_files.created_by_id = ${userId}
      AND draft_workspaces.created_by_id = ${userId}
    ORDER BY workspace_source_files.record_created_at DESC
  `) as SourceFileUsageRow[];

  return rows.map(toSourceFileUsage);
}

export async function deleteUnusedSourceFile(
  id: string,
  userId: string,
): Promise<SourceFile | null> {
  const sql = getDatabase();
  const rows = (await sql`
    DELETE FROM source_files
    WHERE id = ${id}
      AND created_by_id = ${userId}
      AND NOT EXISTS (
        SELECT 1
        FROM workspace_source_files
        WHERE workspace_source_files.source_file_id = source_files.id
      )
    RETURNING *
  `) as SourceFileRow[];

  return rows[0] ? toSourceFile(rows[0]) : null;
}

function toSourceFile(row: SourceFileRow): SourceFile {
  return {
    id: row.id,
    originalName: row.original_name,
    blobPathname: row.blob_pathname,
    blobUrl: row.blob_url,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    checksumMd5Base64: row.checksum_md5_base64,
    processingStatus: row.processing_status,
    statusMessage: row.status_message,
    createdById: row.created_by_id,
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toSourceFileSummary(row: SourceFileSummaryRow): SourceFileSummary {
  return {
    id: row.id,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    processingStatus: row.processing_status,
    statusMessage: row.status_message,
    workspaceCount: Number(row.workspace_count),
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toSourceFileUsage(row: SourceFileUsageRow): SourceFileUsage {
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    purpose: row.usage,
    recordCreatedAt: toIsoString(row.record_created_at),
  };
}

function toSourceFileUploadSession(
  row: SourceFileUploadSessionRow,
): SourceFileUploadSession {
  return {
    id: row.id,
    originalName: row.original_name,
    blobPathname: row.blob_pathname,
    contentType: row.content_type,
    declaredByteSize: Number(row.declared_byte_size),
    status: row.status,
    createdById: row.created_by_id,
    expiresAt: toIsoString(row.expires_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    recordCreatedAt: toIsoString(row.record_created_at),
    recordUpdatedAt: toIsoString(row.record_updated_at),
  };
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}
