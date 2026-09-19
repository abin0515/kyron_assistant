import "server-only";

import { getDatabase } from "@/server/db/client";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  CourseSetup,
  CourseSetupCalibration,
  CourseSetupReviewResult,
  CourseSetupReviewStatus,
} from "@/types/api";
import type {
  CourseSetupGenerationClaimResult,
  CourseSetupGenerationResult,
} from "@/server/drafts/course-setup-calibrations/types";

type CalibrationRow = {
  generated_setup: unknown;
  generated_at: string | Date;
  prompt_version: string;
  model: string;
  review_status: CourseSetupReviewStatus;
  review_result: CourseSetupReviewResult | null;
  reviewed_setup: unknown | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | Date | null;
  submitted_setup: unknown | null;
  submitted_at: string | Date | null;
  kyron_draft_id: string | number | null;
};

export async function getCourseSetupCalibration(
  workspaceId: string,
  userId: string,
): Promise<CourseSetupCalibration | null> {
  const sql = getDatabase();
  const rows = (await sql`
    SELECT calibration.*
    FROM course_setup_calibrations AS calibration
    INNER JOIN draft_workspaces AS workspace
      ON workspace.id = calibration.workspace_id
    WHERE calibration.workspace_id = ${workspaceId}
      AND workspace.created_by_id = ${userId}
      AND calibration.generated_setup IS NOT NULL
    LIMIT 1
  `) as CalibrationRow[];

  return rows[0] ? toCalibration(rows[0]) : null;
}

export async function claimCourseSetupGeneration(
  workspaceId: string,
  userId: string,
  generationToken: string,
): Promise<CourseSetupGenerationClaimResult> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH candidate AS MATERIALIZED (
      SELECT
        workspace.id,
        workspace.batch_id,
        workspace.status,
        workspace.kyron_draft_id,
        calibration.generation_token,
        calibration.generation_started_at
      FROM draft_workspaces AS workspace
      LEFT JOIN course_setup_calibrations AS calibration
        ON calibration.workspace_id = workspace.id
      WHERE workspace.id = ${workspaceId}
        AND workspace.created_by_id = ${userId}
    ),
    claimed AS (
      INSERT INTO course_setup_calibrations (
        workspace_id,
        generation_token,
        generation_started_at
      )
      SELECT id, ${generationToken}, NOW()
      FROM candidate
      WHERE batch_id IS NULL
        AND kyron_draft_id IS NULL
        AND status IN ('editing', 'error')
        AND (
          generation_token IS NULL
          OR generation_started_at < NOW() - INTERVAL '10 minutes'
        )
      ON CONFLICT (workspace_id) DO UPDATE
      SET
        generation_token = EXCLUDED.generation_token,
        generation_started_at = EXCLUDED.generation_started_at,
        record_updated_at = NOW()
      WHERE course_setup_calibrations.generation_token IS NULL
        OR course_setup_calibrations.generation_started_at < NOW() - INTERVAL '10 minutes'
      RETURNING workspace_id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM claimed) THEN 'claimed'
      WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
      WHEN EXISTS (
        SELECT 1 FROM candidate WHERE batch_id IS NOT NULL
      ) THEN 'batch_workspace'
      WHEN EXISTS (
        SELECT 1 FROM candidate
        WHERE kyron_draft_id IS NOT NULL
          OR status NOT IN ('editing', 'error')
      ) THEN 'locked'
      ELSE 'in_progress'
    END AS result
  `) as Array<{ result: CourseSetupGenerationClaimResult }>;

  return rows[0]?.result ?? "not_found";
}

export async function releaseCourseSetupGeneration(
  workspaceId: string,
  userId: string,
  generationToken: string,
): Promise<void> {
  const sql = getDatabase();

  await sql.transaction((transaction) => [
    transaction`
      UPDATE course_setup_calibrations AS calibration
      SET
        generation_token = NULL,
        generation_started_at = NULL,
        record_updated_at = NOW()
      FROM draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.created_by_id = ${userId}
        AND calibration.generation_token = ${generationToken}
        AND calibration.generated_setup IS NOT NULL
    `,
    transaction`
      DELETE FROM course_setup_calibrations AS calibration
      USING draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.created_by_id = ${userId}
        AND calibration.generation_token = ${generationToken}
        AND calibration.generated_setup IS NULL
    `,
  ]);
}

export async function completeCourseSetupGeneration(
  workspaceId: string,
  userId: string,
  generationToken: string,
  result: CourseSetupGenerationResult,
): Promise<boolean> {
  const sql = getDatabase();
  const setup = JSON.stringify(result.setup);
  const rows = (await sql`
    WITH active_cycle AS MATERIALIZED (
      SELECT calibration.workspace_id
      FROM course_setup_calibrations AS calibration
      INNER JOIN draft_workspaces AS workspace
        ON workspace.id = calibration.workspace_id
      WHERE calibration.workspace_id = ${workspaceId}
        AND workspace.created_by_id = ${userId}
        AND workspace.batch_id IS NULL
        AND workspace.kyron_draft_id IS NULL
        AND workspace.status IN ('editing', 'error')
        AND calibration.generation_token = ${generationToken}
    ),
    updated_workspace AS (
      UPDATE draft_workspaces AS workspace
      SET
        name = ${result.setup.name},
        description = ${result.setup.description},
        learning_objective = ${result.setup.learningObjective},
        audience = ${result.setup.audience},
        asset_type = ${result.setup.assetType},
        duration_seconds = ${result.setup.duration},
        status = 'editing',
        status_message = '',
        record_updated_at = NOW()
      FROM active_cycle
      WHERE workspace.id = active_cycle.workspace_id
      RETURNING workspace.id
    ),
    updated_calibration AS (
      UPDATE course_setup_calibrations AS calibration
      SET
        generated_setup = ${setup}::JSONB,
        generated_at = NOW(),
        prompt_version = ${result.promptVersion},
        model = ${result.model},
        generation_token = NULL,
        generation_started_at = NULL,
        review_status = 'needs_review',
        review_result = NULL,
        reviewed_setup = NULL,
        reviewed_by_id = NULL,
        reviewed_by_name = NULL,
        reviewed_by_email = NULL,
        reviewed_at = NULL,
        submitted_setup = NULL,
        submitted_at = NULL,
        kyron_draft_id = NULL,
        record_updated_at = NOW()
      FROM updated_workspace
      WHERE calibration.workspace_id = updated_workspace.id
      RETURNING calibration.workspace_id
    )
    SELECT workspace_id FROM updated_calibration
  `) as Array<{ workspace_id: string }>;

  return Boolean(rows[0]);
}

export async function claimBatchCourseSetupGeneration(
  batchId: string,
  workspaceId: string,
  userId: string,
  generationToken: string,
): Promise<boolean> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH candidate AS MATERIALIZED (
      SELECT
        workspace.id,
        workspace.batch_id,
        workspace.status,
        workspace.kyron_draft_id,
        workspace.setup_status,
        workspace.record_updated_at,
        calibration.generation_token,
        calibration.generation_started_at
      FROM draft_workspaces AS workspace
      LEFT JOIN course_setup_calibrations AS calibration
        ON calibration.workspace_id = workspace.id
      WHERE workspace.id = ${workspaceId}
        AND workspace.batch_id = ${batchId}
        AND workspace.created_by_id = ${userId}
    ),
    claimed AS (
      INSERT INTO course_setup_calibrations (
        workspace_id,
        generation_token,
        generation_started_at
      )
      SELECT id, ${generationToken}, NOW()
      FROM candidate
      WHERE kyron_draft_id IS NULL
        AND status IN ('editing', 'error')
        AND (
          setup_status IN ('pending', 'error')
          OR (
            setup_status = 'generating'
            AND record_updated_at < NOW() - INTERVAL '10 minutes'
          )
        )
        AND (
          generation_token IS NULL
          OR generation_started_at < NOW() - INTERVAL '10 minutes'
        )
      ON CONFLICT (workspace_id) DO UPDATE
      SET
        generation_token = EXCLUDED.generation_token,
        generation_started_at = EXCLUDED.generation_started_at,
        record_updated_at = NOW()
      WHERE course_setup_calibrations.generation_token IS NULL
        OR course_setup_calibrations.generation_started_at < NOW() - INTERVAL '10 minutes'
      RETURNING workspace_id
    ),
    updated_workspace AS (
      UPDATE draft_workspaces AS workspace
      SET
        setup_status = 'generating',
        setup_status_message = 'Extracting the source and generating course fields.',
        record_updated_at = NOW()
      FROM claimed
      WHERE workspace.id = claimed.workspace_id
      RETURNING workspace.id
    ),
    updated_batch AS (
      UPDATE draft_batches AS batch
      SET record_updated_at = NOW()
      WHERE batch.id = ${batchId}
        AND batch.created_by_id = ${userId}
        AND EXISTS (SELECT 1 FROM updated_workspace)
    )
    SELECT id FROM updated_workspace
  `) as Array<{ id: string }>;

  return Boolean(rows[0]);
}

export async function completeBatchCourseSetupGeneration(
  batchId: string,
  workspaceId: string,
  userId: string,
  generationToken: string,
  result: CourseSetupGenerationResult,
): Promise<boolean> {
  const sql = getDatabase();
  const setup = JSON.stringify(result.setup);
  const rows = (await sql`
    WITH active_cycle AS MATERIALIZED (
      SELECT calibration.workspace_id
      FROM course_setup_calibrations AS calibration
      INNER JOIN draft_workspaces AS workspace
        ON workspace.id = calibration.workspace_id
      WHERE calibration.workspace_id = ${workspaceId}
        AND workspace.batch_id = ${batchId}
        AND workspace.created_by_id = ${userId}
        AND workspace.kyron_draft_id IS NULL
        AND workspace.status IN ('editing', 'error')
        AND workspace.setup_status = 'generating'
        AND calibration.generation_token = ${generationToken}
    ),
    updated_workspace AS (
      UPDATE draft_workspaces AS workspace
      SET
        name = ${result.setup.name},
        description = ${result.setup.description},
        learning_objective = ${result.setup.learningObjective},
        audience = ${result.setup.audience},
        asset_type = ${result.setup.assetType},
        duration_seconds = ${result.setup.duration},
        status = 'editing',
        status_message = '',
        setup_status = 'needs_review',
        setup_status_message = 'AI suggestion generated. Human review is required.',
        record_updated_at = NOW()
      FROM active_cycle
      WHERE workspace.id = active_cycle.workspace_id
      RETURNING workspace.id
    ),
    updated_calibration AS (
      UPDATE course_setup_calibrations AS calibration
      SET
        generated_setup = ${setup}::JSONB,
        generated_at = NOW(),
        prompt_version = ${result.promptVersion},
        model = ${result.model},
        generation_token = NULL,
        generation_started_at = NULL,
        review_status = 'needs_review',
        review_result = NULL,
        reviewed_setup = NULL,
        reviewed_by_id = NULL,
        reviewed_by_name = NULL,
        reviewed_by_email = NULL,
        reviewed_at = NULL,
        submitted_setup = NULL,
        submitted_at = NULL,
        kyron_draft_id = NULL,
        record_updated_at = NOW()
      FROM updated_workspace
      WHERE calibration.workspace_id = updated_workspace.id
      RETURNING calibration.workspace_id
    ),
    updated_batch AS (
      UPDATE draft_batches AS batch
      SET record_updated_at = NOW()
      WHERE batch.id = ${batchId}
        AND batch.created_by_id = ${userId}
        AND EXISTS (SELECT 1 FROM updated_calibration)
    )
    SELECT workspace_id FROM updated_calibration
  `) as Array<{ workspace_id: string }>;

  return Boolean(rows[0]);
}

export async function failBatchCourseSetupGeneration(
  batchId: string,
  workspaceId: string,
  userId: string,
  generationToken: string,
  message: string,
): Promise<void> {
  const sql = getDatabase();

  await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces AS workspace
      SET
        setup_status = 'error',
        setup_status_message = ${message},
        record_updated_at = NOW()
      WHERE workspace.id = ${workspaceId}
        AND workspace.batch_id = ${batchId}
        AND workspace.created_by_id = ${userId}
        AND workspace.setup_status = 'generating'
        AND EXISTS (
          SELECT 1
          FROM course_setup_calibrations AS calibration
          WHERE calibration.workspace_id = workspace.id
            AND calibration.generation_token = ${generationToken}
        )
    `,
    transaction`
      UPDATE course_setup_calibrations AS calibration
      SET
        generation_token = NULL,
        generation_started_at = NULL,
        record_updated_at = NOW()
      FROM draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.batch_id = ${batchId}
        AND workspace.created_by_id = ${userId}
        AND calibration.generation_token = ${generationToken}
        AND calibration.generated_setup IS NOT NULL
    `,
    transaction`
      DELETE FROM course_setup_calibrations AS calibration
      USING draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.batch_id = ${batchId}
        AND workspace.created_by_id = ${userId}
        AND calibration.generation_token = ${generationToken}
        AND calibration.generated_setup IS NULL
    `,
    transaction`
      UPDATE draft_batches AS batch
      SET record_updated_at = NOW()
      WHERE batch.id = ${batchId}
        AND batch.created_by_id = ${userId}
    `,
  ]);
}

export async function ensureBatchCourseSetupCalibration(
  batchId: string,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const sql = getDatabase();

  await sql`
    INSERT INTO course_setup_calibrations (
      workspace_id,
      generated_setup,
      generated_at,
      prompt_version,
      model,
      review_status
    )
    SELECT
      workspace.id,
      JSONB_BUILD_OBJECT(
        'name', BTRIM(workspace.name),
        'description', BTRIM(workspace.description),
        'learningObjective', BTRIM(workspace.learning_objective),
        'audience', BTRIM(workspace.audience),
        'assetType', workspace.asset_type,
        'duration', workspace.duration_seconds
      ),
      workspace.record_updated_at,
      'legacy-batch-pre-calibration',
      'unknown',
      'needs_review'
    FROM draft_workspaces AS workspace
    WHERE workspace.id = ${workspaceId}
      AND workspace.batch_id = ${batchId}
      AND workspace.created_by_id = ${userId}
      AND workspace.kyron_draft_id IS NULL
      AND workspace.status IN ('editing', 'error')
      AND workspace.setup_status IN ('needs_review', 'reviewed')
    ON CONFLICT (workspace_id) DO NOTHING
  `;
}

export async function markCourseSetupReviewed(
  workspaceId: string,
  user: CurrentUser,
): Promise<boolean> {
  const sql = getDatabase();
  const rows = (await sql`
    WITH reviewed_calibration AS (
      UPDATE course_setup_calibrations AS calibration
      SET
        reviewed_setup = JSONB_BUILD_OBJECT(
          'name', BTRIM(workspace.name),
          'description', BTRIM(workspace.description),
          'learningObjective', BTRIM(workspace.learning_objective),
          'audience', BTRIM(workspace.audience),
          'assetType', workspace.asset_type,
          'duration', workspace.duration_seconds
        ),
        review_status = 'reviewed',
        review_result = CASE
          WHEN calibration.generated_setup = JSONB_BUILD_OBJECT(
            'name', BTRIM(workspace.name),
            'description', BTRIM(workspace.description),
            'learningObjective', BTRIM(workspace.learning_objective),
            'audience', BTRIM(workspace.audience),
            'assetType', workspace.asset_type,
            'duration', workspace.duration_seconds
          ) THEN 'approved_as_is'
          ELSE 'edited_and_approved'
        END,
        reviewed_by_id = ${user.id},
        reviewed_by_name = ${user.name},
        reviewed_by_email = ${user.email},
        reviewed_at = NOW(),
        record_updated_at = NOW()
      FROM draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.created_by_id = ${user.id}
        AND workspace.kyron_draft_id IS NULL
        AND workspace.status IN ('editing', 'error')
        AND (
          workspace.batch_id IS NULL
          OR workspace.setup_status IN ('needs_review', 'reviewed')
        )
        AND calibration.generated_setup IS NOT NULL
        AND calibration.generation_token IS NULL
      RETURNING calibration.workspace_id, workspace.batch_id
    ),
    updated_workspace AS (
      UPDATE draft_workspaces AS workspace
      SET
        setup_status = 'reviewed',
        setup_status_message = 'Course setup reviewed and ready to submit.',
        record_updated_at = NOW()
      FROM reviewed_calibration
      WHERE workspace.id = reviewed_calibration.workspace_id
        AND reviewed_calibration.batch_id IS NOT NULL
      RETURNING workspace.batch_id
    ),
    updated_batch AS (
      UPDATE draft_batches AS batch
      SET record_updated_at = NOW()
      WHERE batch.id IN (SELECT batch_id FROM updated_workspace)
    )
    SELECT workspace_id FROM reviewed_calibration
  `) as Array<{ workspace_id: string }>;

  return Boolean(rows[0]);
}

export async function completeWorkspaceSubmissionWithCalibration(
  workspaceId: string,
  userId: string,
  kyronDraftId: number,
  statusMessage: string,
  submittedSetup: CourseSetup,
): Promise<boolean> {
  const sql = getDatabase();
  const setup = JSON.stringify(submittedSetup);
  const results = await sql.transaction((transaction) => [
    transaction`
      UPDATE draft_workspaces
      SET
        status = 'submitted',
        status_message = ${statusMessage},
        kyron_draft_id = ${kyronDraftId},
        submitted_at = NOW(),
        record_updated_at = NOW()
      WHERE id = ${workspaceId}
        AND created_by_id = ${userId}
        AND status = 'submitting'
        AND kyron_draft_id IS NULL
      RETURNING id
    `,
    transaction`
      UPDATE course_setup_calibrations AS calibration
      SET
        submitted_setup = ${setup}::JSONB,
        submitted_at = NOW(),
        kyron_draft_id = ${kyronDraftId},
        record_updated_at = NOW()
      FROM draft_workspaces AS workspace
      WHERE calibration.workspace_id = workspace.id
        AND calibration.workspace_id = ${workspaceId}
        AND workspace.created_by_id = ${userId}
        AND workspace.status = 'submitted'
        AND workspace.kyron_draft_id = ${kyronDraftId}
    `,
  ]);

  const updatedWorkspaces = results[0] as Array<{ id: string }>;

  return Boolean(updatedWorkspaces[0]);
}

function toCalibration(row: CalibrationRow): CourseSetupCalibration {
  const reviewedBy =
    row.reviewed_by_id && row.reviewed_by_name && row.reviewed_by_email
      ? {
          id: row.reviewed_by_id,
          name: row.reviewed_by_name,
          email: row.reviewed_by_email,
        }
      : null;

  return {
    generatedSetup: readCourseSetup(row.generated_setup),
    generatedAt: toIsoString(row.generated_at),
    promptVersion: row.prompt_version,
    model: row.model,
    reviewStatus: row.review_status,
    reviewResult: row.review_result,
    reviewedSetup: row.reviewed_setup
      ? readCourseSetup(row.reviewed_setup)
      : null,
    reviewedBy,
    reviewedAt: toNullableIsoString(row.reviewed_at),
    submittedSetup: row.submitted_setup
      ? readCourseSetup(row.submitted_setup)
      : null,
    submittedAt: toNullableIsoString(row.submitted_at),
    kyronDraftId:
      row.kyron_draft_id === null ? null : Number(row.kyron_draft_id),
  };
}

function readCourseSetup(value: unknown): CourseSetup {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A stored course setup calibration is invalid.");
  }

  const setup = value as Record<string, unknown>;

  if (
    typeof setup.name !== "string" ||
    typeof setup.description !== "string" ||
    typeof setup.learningObjective !== "string" ||
    typeof setup.audience !== "string" ||
    !["lesson", "practice", "scenario"].includes(String(setup.assetType)) ||
    ![480, 900, 1800, 3600].includes(Number(setup.duration))
  ) {
    throw new Error("A stored course setup calibration is invalid.");
  }

  return {
    name: setup.name,
    description: setup.description,
    learningObjective: setup.learningObjective,
    audience: setup.audience,
    assetType: setup.assetType as CourseSetup["assetType"],
    duration: Number(setup.duration) as CourseSetup["duration"],
  };
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

function toNullableIsoString(value: string | Date | null): string | null {
  return value ? toIsoString(value) : null;
}
