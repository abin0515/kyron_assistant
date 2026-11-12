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
  // Saved just before Kyron is asked to render, so an interrupted request is
  // never sent twice.
  videoRequestStartedAt?: string | null;
  // Set once a status check found the requested render in progress. Until
  // then a finished result may still be the previous render's.
  videoRenderSeen?: boolean;
  videoPollState?: VideoPollState | null;
  // When the next step may run, if the last step left the run waiting (a
  // render check); null otherwise.
  nextStepAt?: number | null;
  // Claims since the run was last released. Two in a row mean the earlier
  // attempt never finished (stopped by the platform or past its lease).
  claimsWithoutRelease?: number;
};

// What a content source keeps between the status checks of one render. For
// Kyron: the activities whose video had already failed before the request,
// until they are seen rendering again, so an old error is not read as this
// render's; whether other videos were seen rendering; how many checks in a
// row only those old errors were left; how many light checks in a row there
// were since every activity was read in full; and the activities last seen
// rendering on a video part.
export type VideoPollState = {
  staleFailures: string[];
  sawRendering?: boolean;
  staleWaits?: number;
  checksSinceFull?: number;
  renderingIds?: string[];
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
