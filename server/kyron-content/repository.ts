import "server-only";

import { getDatabase } from "@/server/db/client";
import { REVISION_AGENT_NAME } from "@/server/qa/revision-agent";
import type { KyronContentDraftSummary } from "@/types/api";

const MAX_DRAFTS = 100;

type DraftSummaryRow = {
  kyron_draft_id: string | number;
  name: string;
  status: string;
  kyron_availability: string;
  kyron_updated_at: string | Date | null;
  applied_changes: string | number | null;
  proposed_changes: string | number | null;
  latest_run_id: string | null;
  latest_run_at: string | Date | null;
};

// The launcher's drafts, newest first, with how much the QA agent changed or
// proposed in each and its latest QA run.
export async function listDraftSummaries(): Promise<KyronContentDraftSummary[]> {
  const agentAuthor = `${REVISION_AGENT_NAME}%`;
  const rows = (await getDatabase()`
    SELECT
      d.kyron_draft_id, d.name, d.status, d.kyron_availability, d.kyron_updated_at,
      v.applied_changes, v.proposed_changes,
      r.id AS latest_run_id, r.record_created_at AS latest_run_at
    FROM drafts d
    LEFT JOIN LATERAL (
      SELECT id FROM qa_lessons
      WHERE kyron_draft_id = d.kyron_draft_id
      ORDER BY record_updated_at DESC
      LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        SUM(jsonb_array_length(changes)) FILTER (WHERE status = 'applied' AND author LIKE ${agentAuthor}) AS applied_changes,
        SUM(jsonb_array_length(changes)) FILTER (WHERE status = 'proposed') AS proposed_changes
      FROM qa_content_versions
      WHERE lesson_id = l.id AND target = 'lesson'
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, record_created_at FROM qa_runs
      WHERE lesson_id = l.id AND target = 'lesson'
      ORDER BY record_created_at DESC
      LIMIT 1
    ) r ON TRUE
    ORDER BY d.record_created_at DESC
    LIMIT ${MAX_DRAFTS}
  `) as DraftSummaryRow[];

  return rows.map((row) => ({
    draftId: Number(row.kyron_draft_id),
    name: row.name,
    status: row.status,
    available: row.kyron_availability !== "unavailable",
    updatedAt: row.kyron_updated_at ? new Date(row.kyron_updated_at).toISOString() : null,
    qaChangesApplied: Number(row.applied_changes ?? 0),
    qaChangesProposed: Number(row.proposed_changes ?? 0),
    latestRunId: row.latest_run_id,
    latestRunAt: row.latest_run_at ? new Date(row.latest_run_at).toISOString() : null,
  }));
}
