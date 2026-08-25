export const COURSE_FIELD_LIMITS = {
  name: 200,
  description: 4_000,
  learningObjective: 2_000,
  audience: 1_000,
} as const;
export const COURSE_BRIEF_MAX_LENGTH = 50_000;

export const ASSET_TYPES = ["lesson", "practice", "scenario"] as const;
export const DURATIONS = [480, 900, 1800, 3600] as const;
export const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
export const MAX_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024;
export const KYRON_AVAILABILITIES = [
  "available",
  "unavailable",
  "unknown",
] as const;
export const DRAFT_WORKSPACE_STATUSES = [
  "editing",
  "submitting",
  "submitted",
  "error",
] as const;
export const SOURCE_FILE_USAGES = [
  "ai_input",
  "kyron_attachment",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type Duration = (typeof DURATIONS)[number];
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];
export type DraftStatus = "started" | "done" | "error";
export type KyronAvailability =
  (typeof KYRON_AVAILABILITIES)[number];
export type DraftWorkspaceStatus =
  (typeof DRAFT_WORKSPACE_STATUSES)[number];
export type SourceFileUsagePurpose =
  (typeof SOURCE_FILE_USAGES)[number];
export type SourceFileUsageState = "active" | "historical";

export const UPLOAD_CONTENT_TYPE_BY_EXTENSION: Record<
  ".pdf" | ".pptx",
  UploadContentType
> = {
  ".pdf": "application/pdf",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export type CourseSetup = {
  name: string;
  description: string;
  learningObjective: string;
  audience: string;
  assetType: AssetType;
  duration: Duration;
};

export type GenerateCourseSetupRequest = {
  brief?: string;
  workspaceId?: string;
};

export type GenerateCourseSetupResponse = {
  suggestion: CourseSetup;
};

export type CreateDraftRequest = CourseSetup & {
  alignmentContentSignedId?: string;
};

export type SignUploadRequest = {
  filename: string;
  byteSize: number;
  checksum: string;
  contentType: UploadContentType;
};

export type SignUploadResponse = {
  signedId: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
};

export type Draft = {
  id: number;
  name: string;
  status: DraftStatus;
  statusMessage: string;
  previewUrl: string;
  editorUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ManagedDraft = Draft & {
  assetType: AssetType;
  kyronAvailability: KyronAvailability;
  kyronCheckedAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  recordCreatedAt: string;
  recordUpdatedAt: string;
};

export type DraftWorkspace = CourseSetup & {
  id: string;
  status: DraftWorkspaceStatus;
  statusMessage: string;
  sourceText: string;
  kyronDraftId: number | null;
  submittedAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  recordCreatedAt: string;
  recordUpdatedAt: string;
};

export type DraftWorkspaceSummary = Pick<
  DraftWorkspace,
  | "id"
  | "name"
  | "assetType"
  | "duration"
  | "status"
  | "statusMessage"
  | "kyronDraftId"
  | "submittedAt"
  | "recordCreatedAt"
  | "recordUpdatedAt"
>;

export type UpdateDraftWorkspaceRequest = Partial<
  CourseSetup & {
    sourceText: string;
  }
>;

export type DraftWorkspaceListResponse = {
  workspaces: DraftWorkspaceSummary[];
};

export type SourceFileType = "pdf" | "pptx" | "docx";

export type SourceFileListItem = {
  id: string;
  name: string;
  size: number;
  type: SourceFileType;
  workspaceCount: number;
  uploadedAt: string;
  updatedAt: string;
};

export type SourceFileListResponse = {
  files: SourceFileListItem[];
};

export type SourceFileUsageItem = {
  workspaceId: string;
  workspaceTitle: string;
  purpose: SourceFileUsagePurpose;
  state: SourceFileUsageState;
  linkedAt: string;
};

export type SourceFileUsageResponse = {
  usages: SourceFileUsageItem[];
};

export type WorkspaceSourceFileItem = SourceFileListItem & {
  purpose: SourceFileUsagePurpose;
  linkedAt: string;
};

export type WorkspaceSourceFileListResponse = {
  files: WorkspaceSourceFileItem[];
};

export type UpdateWorkspaceSourceFilesRequest = {
  purpose: SourceFileUsagePurpose;
  sourceFileIds: string[];
};

export type SourceFileUploadClientPayload = {
  uploadId: string;
  name: string;
  size: number;
};

export type CompleteSourceFileUploadRequest = {
  uploadId: string;
  blobUrl: string;
};

export type CompleteSourceFileUploadResponse = {
  file: SourceFileListItem;
};

export type ExtractSourceFileTextResponse = {
  file: {
    id: string;
    processingStatus: "ready";
    statusMessage: string;
    extractedAt: string;
    extractedCharacterCount: number;
  };
};

export type DraftListResponse = {
  drafts: ManagedDraft[];
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPLOAD_FAILED"
  | "KYRON_UNAUTHORIZED"
  | "KYRON_NOT_FOUND"
  | "KYRON_RATE_LIMITED"
  | "KYRON_UNAVAILABLE"
  | "KYRON_INVALID_RESPONSE"
  | "REQUEST_TIMEOUT"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
  };
};

export type OrganizationResponse = {
  organization: {
    name: string;
  };
};
