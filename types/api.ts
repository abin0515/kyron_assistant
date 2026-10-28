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

export type KyronFolderPathItem = {
  id: number;
  name: string;
};

export type KyronDestination = {
  folderId: number | null;
  path: KyronFolderPathItem[];
};

export type GenerateCourseSetupRequest = {
  workspaceId: string;
};

export type GenerateCourseSetupResponse = {
  workspace: DraftWorkspace;
};

export type CreateDraftRequest = CourseSetup & {
  alignmentContentSignedId?: string;
  assetFolderId?: number;
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
  kyronDestination: KyronDestination;
  courseSetupCalibration: CourseSetupCalibration | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  recordCreatedAt: string;
  recordUpdatedAt: string;
};

export type CourseSetupReviewStatus = "needs_review" | "reviewed";
export type CourseSetupReviewResult =
  | "approved_as_is"
  | "edited_and_approved";

export type CourseSetupCalibration = {
  generatedSetup: CourseSetup;
  generatedAt: string;
  promptVersion: string;
  model: string;
  reviewRequired: boolean;
  reviewStatus: CourseSetupReviewStatus;
  reviewResult: CourseSetupReviewResult | null;
  reviewedSetup: CourseSetup | null;
  reviewedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewedAt: string | null;
  submittedSetup: CourseSetup | null;
  submittedAt: string | null;
  kyronDraftId: number | null;
  includeInCalibration: boolean;
  calibrationSelectedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  calibrationSelectedAt: string | null;
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

export type UpdateKyronDestinationRequest = {
  destination: KyronDestination;
};

export type SubmitDraftWorkspaceRequest = {
  includeInCalibration: boolean;
};

export type DraftWorkspaceListResponse = {
  workspaces: DraftWorkspaceSummary[];
  pagination: PaginationMeta;
};

export type PaginationMeta = {
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
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
  pagination: PaginationMeta;
  summary: {
    totalBytes: number;
    linkedFiles: number;
  };
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

export type BatchWorkspaceStatus =
  | "setup_pending"
  | "setup_generating"
  | "setup_error"
  | "ready"
  | "submitting"
  | "generating"
  | "complete"
  | "kyron_error";

export type BatchWorkspaceItem = {
  id: string;
  sourceFile: Pick<
    SourceFileListItem,
    "id" | "name" | "size" | "type"
  > | null;
  status: BatchWorkspaceStatus;
  statusMessage: string;
  setup: CourseSetup;
  attachToKyron: boolean;
  includeInCalibration: boolean;
  kyronDestination: KyronDestination;
  kyronDraftId: number | null;
  updatedAt: string;
};

export type DraftBatch = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workspaces: BatchWorkspaceItem[];
};

export type DraftBatchListResponse = {
  batches: DraftBatch[];
  pagination: PaginationMeta;
};

export type DraftBatchResponse = {
  batch: DraftBatch;
};

export type CreateDraftBatchRequest = {
  name: string;
  sourceFileIds: string[];
  kyronDestination?: KyronDestination;
};

export type GenerateDraftBatchRequest = {
  workspaceIds?: string[];
};

export type UpdateBatchWorkspaceRequest = CourseSetup & {
  attachToKyron: boolean;
  includeInCalibration: boolean;
};

export type DraftListResponse = {
  drafts: ManagedDraft[];
  pagination: PaginationMeta;
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPLOAD_FAILED"
  | "KYRON_UNAUTHORIZED"
  | "KYRON_NOT_FOUND"
  | "KYRON_CONFLICT"
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

export type KyronAssetFolderItem = {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type KyronAssetFolderListResponse = {
  folders: KyronAssetFolderItem[];
  pagination: PaginationMeta;
};

export type CreateKyronAssetFolderRequest = {
  name: string;
  parentId?: number;
};

export type KyronAssetFolderResponse = {
  folder: KyronAssetFolderItem;
};
