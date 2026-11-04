import type {
  QaActivity,
  QaContentVersionDetail,
  QaEvaluatorId,
  QaLessonContent,
  QaReference,
  QaRun,
} from "@/types/api";

export type ScriptEvaluatorId = Exclude<QaEvaluatorId, "media" | "human">;

// Work the pipeline still has to do for a run, processed one step per tick.
export type QaStep =
  | { kind: "snapshot" }
  | { kind: "check"; evaluator: ScriptEvaluatorId; activityIds: string[] | null }
  | { kind: "decide" }
  | { kind: "revise" }
  | { kind: "verify" }
  | { kind: "recheck" }
  | { kind: "video_request" }
  | { kind: "video_poll"; attempt: number }
  | { kind: "media_check" }
  | { kind: "finalize" };

export type StoredQaRun = QaRun & {
  pendingSteps: QaStep[];
  lease: { token: string; expiresAt: number } | null;
  // Consecutive failures of the step at the head of pendingSteps.
  stepFailures: number;
  // Fields written by the current revision round, re-checked by "recheck".
  patchedFields: Array<{ activityId: string; fieldPath: string }>;
  videoJobId: string | null;
  mediaFilePath: string | null;
  // Changes written by the last revision round, waiting for the verifier.
  unverifiedChanges?: AppliedChange[];
  // Video renders requested for this run (at most two: render and re-render).
  videoRequests?: number;
};

export type AppliedChange = {
  activityId: string | null;
  fieldPath: string;
  before: string | null;
  after: string;
  findingIds: string[];
};

export type LessonPacket = {
  lesson: QaLessonContent;
  activities: QaActivity[];
  references: QaReference[];
};

export type QaRubricApproval = {
  domain: string;
  version: string;
  approvedBy: string;
  approvedAt: string;
};

// A content version to record; the repository assigns its id, number and time.
export type NewContentVersion = Omit<
  QaContentVersionDetail,
  "id" | "versionNumber" | "lessonTitle" | "createdAt"
>;

export type ContentVersionFilter = {
  lessonId?: string;
  target?: QaContentVersionDetail["target"];
};
