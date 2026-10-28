import type {
  SourceFileUsagePurpose,
  SourceFileUsageState,
} from "@/types/api";

export const SOURCE_FILE_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const SOURCE_FILE_PROCESSING_STATUSES = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;

export const SOURCE_FILE_UPLOAD_STATUSES = [
  "pending",
  "completed",
  "expired",
] as const;

export type SourceFileContentType =
  (typeof SOURCE_FILE_CONTENT_TYPES)[number];
export type SourceFileProcessingStatus =
  (typeof SOURCE_FILE_PROCESSING_STATUSES)[number];
export type SourceFileUploadStatus =
  (typeof SOURCE_FILE_UPLOAD_STATUSES)[number];

export type SourceFile = {
  id: string;
  originalName: string;
  blobPathname: string;
  blobUrl: string;
  contentType: SourceFileContentType;
  byteSize: number;
  checksumMd5Base64: string | null;
  processingStatus: SourceFileProcessingStatus;
  statusMessage: string;
  extractedText: string | null;
  extractedAt: string | null;
  createdById: string;
  recordCreatedAt: string;
  recordUpdatedAt: string;
};

export type SourceFileSummary = Pick<
  SourceFile,
  | "id"
  | "originalName"
  | "contentType"
  | "byteSize"
  | "processingStatus"
  | "statusMessage"
  | "recordCreatedAt"
  | "recordUpdatedAt"
> & {
  workspaceCount: number;
};

export type SourceFileLibrarySummary = {
  totalBytes: number;
  linkedFiles: number;
};

export type SourceFileListFilter = {
  contentTypes: SourceFileContentType[];
  query: string;
};

export type SourceFileUsage = {
  workspaceId: string;
  workspaceName: string;
  purpose: SourceFileUsagePurpose;
  state: SourceFileUsageState;
  recordCreatedAt: string;
};

export type CreateSourceFileInput = Pick<
  SourceFile,
  | "originalName"
  | "blobPathname"
  | "blobUrl"
  | "contentType"
  | "byteSize"
  | "checksumMd5Base64"
>;

export type SourceFileUploadSession = {
  id: string;
  originalName: string;
  blobPathname: string;
  contentType: SourceFileContentType;
  declaredByteSize: number;
  status: SourceFileUploadStatus;
  createdById: string;
  expiresAt: string;
  completedAt: string | null;
  recordCreatedAt: string;
  recordUpdatedAt: string;
};

export type CreateSourceFileUploadSessionInput = Pick<
  SourceFileUploadSession,
  | "originalName"
  | "blobPathname"
  | "contentType"
  | "declaredByteSize"
  | "expiresAt"
>;
