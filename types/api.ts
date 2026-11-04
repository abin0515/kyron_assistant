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
  // Submit even though the course-setup quality check has unresolved findings.
  qaOverride?: boolean;
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
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "KYRON_MCP_NOT_CONFIGURED"
  | "KYRON_MCP_NOT_CONNECTED"
  | "KYRON_MCP_TOOL_NOT_ALLOWED"
  | "KYRON_MCP_UNAVAILABLE"
  | "QA_CHECKING"
  | "QA_BLOCKED"
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

export type AccessRole = "admin" | "developer";

export type UserRole = AccessRole | "user";

export type WorkspaceAccount =
  | { mode: "clerk"; role: "user" }
  | { mode: "access-code"; name: string; role: AccessRole };

export type AccessCodeSignInRequest = {
  code: string;
};

export type AccessCodeSignInResponse = {
  user: {
    name: string;
    role: AccessRole;
  };
};

export type KyronMcpConnectionStatus =
  | {
      status: "not_configured";
      redirectUri: string;
    }
  | {
      status: "disconnected";
      clientId: string;
      redirectUri: string;
    }
  | {
      status: "connected";
      clientId: string;
      redirectUri: string;
      scope: string;
      connectedAt: string;
      connectedBy: string;
      accessTokenExpiresAt: string | null;
      canRefresh: boolean;
    };

export type KyronMcpConnectionResponse = {
  connection: KyronMcpConnectionStatus;
};

export type KyronMcpToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type KyronMcpToolSummary = {
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: KyronMcpToolAnnotations | null;
  explorerAllowed: boolean;
};

export type KyronMcpCapabilityManifest = {
  fetchedAt: string;
  server: {
    name: string;
    version: string;
    title: string | null;
  } | null;
  instructions: string | null;
  capabilities: unknown;
  tools: KyronMcpToolSummary[];
};

export type KyronMcpToolCallRequest = {
  name: string;
  arguments: Record<string, unknown>;
};

export type KyronMcpContentItem =
  | { type: "text"; text: string }
  | { type: "image" | "audio"; mimeType: string; byteLength: number }
  | {
      type: "resource_link";
      uri: string;
      name: string | null;
      mimeType: string | null;
    }
  | {
      type: "resource";
      uri: string;
      mimeType: string | null;
      text: string | null;
      byteLength: number | null;
    }
  | { type: "unknown"; raw: unknown };

export type KyronMcpToolCallResponse = {
  result: {
    isError: boolean;
    content: KyronMcpContentItem[];
    structuredContent: unknown;
    truncated: boolean;
  };
  durationMs: number;
};

export type KyronClientMetadataSetup = {
  clientId: string | null;
  redirectUri: string;
  documentJson: string;
};

export type QaDomain = "cpe" | "hs-ai";

export type QaActivityType =
  | "instruction"
  | "question"
  | "conversation"
  | "scenario"
  | "reflection"
  | "other";

export type QaQuestion = {
  prompt: string;
  options: Array<{ id: string; text: string }>;
  answerKey: string[];
  rationale: string | null;
};

export type QaMediaReference = {
  kind: "video" | "image" | "audio" | "other";
  description: string | null;
  url: string | null;
};

// One scene of a Kyron video: what is shown and what the avatar says.
export type QaScene = {
  id: string;
  part: string;
  title: string | null;
  onScreenText: string | null;
  narration: string | null;
  hasVideo: boolean;
};

export type QaVocabularyTerm = {
  id: string;
  term: string;
  definition: string | null;
};

export type QaActivity = {
  id: string;
  title: string | null;
  type: QaActivityType;
  narration: string | null;
  onScreenText: string | null;
  question: QaQuestion | null;
  tutorGuidance: string | null;
  media: QaMediaReference[];
  // Kyron content: fixes target scenes and vocabulary terms directly, while
  // narration and onScreenText are their joined text for the checks.
  scenes?: QaScene[];
  terms?: QaVocabularyTerm[];
  // Fields the source derives and cannot write.
  readOnlyFields?: string[];
};

export type QaLessonContent = {
  title: string;
  description: string | null;
  audience: string | null;
  learningObjectives: string[];
  durationSeconds: number | null;
  assetType: string | null;
};

export type QaReference = {
  title: string;
  text: string;
};

export type QaMissingField = {
  activityId: string | null;
  field: string;
};

export type QaRunTarget = "course_setup" | "lesson";

export type QaContentSourceKind = "manual" | "kyron_mcp" | "workspace_setup";

export type QaLessonSnapshot = {
  id: string;
  lessonId: string;
  source: QaContentSourceKind;
  contentHash: string;
  createdAt: string;
  createdBy: string;
  lesson: QaLessonContent;
  activities: QaActivity[];
  references: QaReference[];
  missingFields: QaMissingField[];
};

export type QaLesson = {
  id: string;
  title: string;
  domain: QaDomain;
  workspaceId: string | null;
  ownerId: string;
  kyronLessonId: number | null;
  createdAt: string;
  createdBy: string;
  latestSnapshotId: string | null;
  latestRunId: string | null;
};

export type QaRunStage =
  | "queued"
  | "snapshot"
  | "checking"
  | "repairing"
  | "video"
  | "media_check"
  | "passed"
  | "changes_proposed"
  | "incomplete"
  | "escalated"
  | "verified"
  | "blocked"
  | "error";

export type QaEvaluatorId =
  | "course_setup"
  | "structural"
  | "alignment"
  | "assessment"
  | "fidelity"
  | "consistency"
  | "media"
  | "human";

export type QaCheckStatus =
  | "pass"
  | "fail"
  | "needs_review"
  | "not_tested"
  | "not_applicable";

export type QaSeverity = "critical" | "major" | "minor";

export type QaCheckResult = {
  id: string;
  criterionId: string;
  evaluator: QaEvaluatorId;
  activityId: string | null;
  status: QaCheckStatus;
  summary: string;
  snapshotId: string;
  checkedAt: string;
};

export type QaEvidence = {
  kind: "reference" | "lesson" | "transcript" | "rule" | "model";
  label: string;
  quote: string;
};

export type QaPatchProposal = {
  activityId: string | null;
  fieldPath: string;
  currentValue: string;
  proposedValue: string;
  rationale: string;
  protectedField: boolean;
};

export type QaFindingStatus =
  | "open"
  | "fixed"
  | "escalated"
  | "accepted"
  | "rejected"
  | "waived";

export type QaFinding = {
  id: string;
  snapshotId: string;
  criterionId: string;
  evaluator: QaEvaluatorId;
  activityId: string | null;
  fieldPath: string | null;
  severity: QaSeverity;
  status: QaFindingStatus;
  observedText: string | null;
  expectedBehavior: string;
  rationale: string;
  evidence: QaEvidence[];
  retest: string;
  proposedPatch: QaPatchProposal | null;
  proposalAttempted: boolean;
  repairAttempts: number;
  escalationReason: string | null;
  decision: {
    outcome: "accepted" | "rejected" | "waived";
    reason: string;
    decidedBy: string;
    decidedAt: string;
  } | null;
  createdAt: string;
};

export type QaRunEvent = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type QaUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type QaHumanCheck = {
  criterionId: string;
  title: string;
  status: "pending" | "pass" | "fail";
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type QaMediaCheck = {
  fileName: string;
  byteSize: number;
  source: "upload" | "kyron_mcp";
  status: "pending" | "checked" | "failed";
  transcript: string | null;
  message: string | null;
};

export type QaRun = {
  id: string;
  lessonId: string;
  workspaceId: string | null;
  ownerId: string;
  target: QaRunTarget;
  snapshotId: string | null;
  domain: QaDomain;
  rubricVersion: string;
  rubricApproved: boolean;
  source: QaContentSourceKind;
  stage: QaRunStage;
  stageMessage: string;
  checks: QaCheckResult[];
  findings: QaFinding[];
  humanChecks: QaHumanCheck[];
  media: QaMediaCheck | null;
  events: QaRunEvent[];
  usage: QaUsage;
  usageByPurpose: Record<string, QaUsage>;
  tokenBudget: number;
  audit: {
    required: boolean;
    sampledAt: string | null;
    outcome: "pending" | "pass" | "defect_found" | null;
    note: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
  };
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  completedAt: string | null;
};

export type QaRunSummary = Pick<
  QaRun,
  "id" | "target" | "stage" | "stageMessage" | "domain" | "workspaceId" | "createdAt" | "completedAt"
> & {
  title: string;
  blockingFindings: number;
  totalFindings: number;
};

export type QaRunListResponse = {
  runs: QaRunSummary[];
};

export type QaWorkspaceQaResponse = {
  setup: QaRunDetailResponse | null;
  lesson: QaRunDetailResponse | null;
};

export type QaLessonContentRequest = {
  packet: unknown;
};

export type QaRunDetailResponse = {
  run: QaRun;
  lesson: QaLesson;
  snapshot: QaLessonSnapshot | null;
  contentWritable: boolean;
  pendingStepCount: number;
  criteria: QaRubricCriterion[];
  // Newest first: the version history of this run's lesson and target.
  versions: QaContentVersion[];
};

// "applied" content really is in this state; "proposed" is a revision the
// agent could not apply (pasted content, or a change that needs approval).
export type QaContentVersionStatus = "applied" | "proposed";

export type QaContentChange = {
  activityId: string | null;
  fieldPath: string;
  before: string | null;
  after: string;
  rationale: string;
  findingIds: string[];
  criterionIds: string[];
};

export type QaContentVersion = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  target: QaRunTarget;
  versionNumber: number;
  parentVersionId: string | null;
  status: QaContentVersionStatus;
  source: QaContentSourceKind;
  author: string;
  model: string | null;
  runId: string | null;
  workspaceId: string | null;
  kyronDraftId: number | null;
  contentHash: string;
  summary: string;
  changes: QaContentChange[];
  createdAt: string;
};

export type QaVersionContent = {
  lesson: QaLessonContent;
  activities: QaActivity[];
};

export type QaContentVersionDetail = QaContentVersion & {
  content: QaVersionContent;
};

export type QaContentVersionListResponse = {
  versions: QaContentVersion[];
  pagination: PaginationMeta;
};

export type QaFindingDecisionRequest = {
  outcome: "accepted" | "rejected" | "waived";
  reason: string;
};

export type QaHumanCheckRequest = {
  status: "pass" | "fail";
  note: string;
};

export type QaAuditRequest = {
  outcome: "pass" | "defect_found";
  note: string;
};

export type QaRubricCriterion = {
  id: string;
  target: QaRunTarget;
  title: string;
  dimension:
    | "setup"
    | "structure"
    | "accuracy"
    | "alignment"
    | "assessment"
    | "pedagogy"
    | "consistency"
    | "media"
    | "tutor";
  evaluator: QaEvaluatorId;
  requirement: string;
  releaseBlocker: string;
  required: boolean;
};

export type QaRubricPack = {
  domain: QaDomain;
  name: string;
  version: string;
  audienceGuidance: string;
  criteria: QaRubricCriterion[];
  approval: {
    approvedBy: string;
    approvedAt: string;
  } | null;
};

export type QaRubricListResponse = {
  rubrics: QaRubricPack[];
};

export type QaEscalation = {
  runId: string;
  target: QaRunTarget;
  workspaceId: string | null;
  lessonTitle: string;
  domain: QaDomain;
  finding: QaFinding;
};

export type QaEscalationListResponse = {
  escalations: QaEscalation[];
};

export type QaDomainMetrics = {
  domain: QaDomain;
  lessons: number;
  runs: number;
  runsByStage: Partial<Record<QaRunStage, number>>;
  openBlockingFindings: number;
  pendingEscalations: number;
  findingsBySeverity: Record<QaSeverity, number>;
  rejectedFindings: number;
  audits: { required: number; completed: number; defectsFound: number };
  usage: QaUsage;
  averageTokensPerRun: number;
};

export type QaMetricsResponse = {
  domains: QaDomainMetrics[];
  generatedAt: string;
};

// One course moving through the production pipeline, from its course setup
// to a reviewed, rendered Kyron lesson.
export type ProductionStage =
  | "setup"
  | "generating"
  | "lesson_qa"
  | "video"
  | "review"
  | "ready"
  | "blocked";

export type ProductionJob = {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  stage: ProductionStage;
  stageMessage: string;
  // What a person still has to do; empty while the pipeline works alone.
  needs: string[];
  kyronDraftId: number | null;
  setupRunId: string | null;
  lessonRunId: string | null;
  costUsd: number;
  budgetUsd: number;
  events: Array<{ at: string; stage: ProductionStage; message: string }>;
  createdAt: string;
  updatedAt: string;
};

export type ProductionJobListResponse = {
  jobs: ProductionJob[];
};

export type QaDefectStage = "setup" | "lesson" | "video" | "harness";

export type QaDefectCategory =
  | "qa_missed"
  | "false_alarm"
  | "wrong_fix"
  | "harness_bug"
  | "kyron_output"
  | "source_problem"
  | "cost_or_performance";

export type QaDefect = {
  id: string;
  workspaceId: string | null;
  runId: string | null;
  findingId: string | null;
  stage: QaDefectStage;
  category: QaDefectCategory;
  severity: QaSeverity;
  status: "open" | "triaged" | "resolved";
  origin: "reviewer" | "rejected_finding" | "audit";
  title: string;
  expected: string;
  actual: string;
  evidence: string;
  rootCause: string;
  createdBy: string;
  createdAt: string;
};

export type QaDefectListResponse = {
  defects: QaDefect[];
};

export type CreateQaDefectRequest = Pick<
  QaDefect,
  "stage" | "category" | "severity" | "title" | "expected" | "actual" | "evidence"
> & {
  workspaceId: string | null;
  runId: string | null;
};

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "auth"
  | "openai"
  | "kyron_api"
  | "kyron_mcp"
  | "qa"
  | "draft"
  | "system";

export type LogEventItem = {
  id: string;
  occurredAt: string;
  level: LogLevel;
  category: LogCategory;
  event: string;
  message: string;
  actorId: string | null;
  actorRole: string | null;
  qaRunId: string | null;
  workspaceId: string | null;
  kyronDraftId: number | null;
  durationMs: number | null;
  data: Record<string, unknown>;
};

export type LlmUsageItem = {
  id: string;
  occurredAt: string;
  purpose: string;
  provider: string;
  model: string;
  status: "completed" | "incomplete" | "error";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  actorId: string | null;
  qaRunId: string | null;
  workspaceId: string | null;
};

export type LogEventListResponse = {
  events: LogEventItem[];
  pagination: PaginationMeta;
};

export type LlmUsageListResponse = {
  usage: LlmUsageItem[];
  pagination: PaginationMeta;
};

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  unpricedCalls: number;
  failedCalls: number;
};

export type LogSummaryResponse = {
  windows: Array<{
    label: string;
    hours: number;
    usage: UsageTotals;
    errorEvents: number;
  }>;
  byModel: Array<UsageTotals & { model: string }>;
  byPurpose: Array<UsageTotals & { purpose: string }>;
  generatedAt: string;
};

export type ModelPriceItem = {
  id: string;
  provider: string;
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  effectiveFrom: string;
  note: string;
};

export type ModelPriceListResponse = {
  prices: ModelPriceItem[];
};

export type CreateModelPriceRequest = {
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  note: string;
};

export type PurgeLogsRequest = {
  olderThanDays: number;
  confirm: true;
};

export type PurgeLogsResponse = {
  deletedEvents: number;
  deletedUsage: number;
};
