import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabase } from "@/server/db/client";
import { logEvent } from "@/server/logging/writer";
import type { CreateQaDefectRequest, QaDefect } from "@/types/api";

type DefectRow = {
  id: string;
  workspace_id: string | null;
  run_id: string | null;
  finding_id: string | null;
  stage: QaDefect["stage"];
  category: QaDefect["category"];
  severity: QaDefect["severity"];
  status: QaDefect["status"];
  origin: QaDefect["origin"];
  data: Pick<QaDefect, "title" | "expected" | "actual" | "evidence" | "rootCause">;
  created_by: string;
  record_created_at: string | Date;
};

const MAX_LISTED = 500;

// The defect library: every problem found while testing, in one place.
// Reviewers log misses and wrong fixes; rejected findings and failed audits
// are added automatically. Its rows become the testing sets.
export async function recordDefect(
  defect: Omit<QaDefect, "id" | "status" | "createdAt" | "rootCause"> & { rootCause?: string },
): Promise<QaDefect> {
  const id = randomUUID();
  const data = {
    title: defect.title,
    expected: defect.expected,
    actual: defect.actual,
    evidence: defect.evidence,
    rootCause: defect.rootCause ?? "",
  };
  const rows = (await getDatabase()`
    INSERT INTO qa_defects (
      id, workspace_id, run_id, finding_id, stage, category, severity, origin, data, created_by
    )
    VALUES (
      ${id}, ${defect.workspaceId}, ${defect.runId}, ${defect.findingId}, ${defect.stage},
      ${defect.category}, ${defect.severity}, ${defect.origin}, ${JSON.stringify(data)}::JSONB,
      ${defect.createdBy}
    )
    RETURNING record_created_at
  `) as Array<{ record_created_at: string | Date }>;

  await logEvent({
    category: "qa",
    event: "qa.defect",
    level: "warn",
    message: `Defect logged (${defect.category.replace(/_/g, " ")}, ${defect.severity}): ${defect.title}`,
    qaRunId: defect.runId,
    workspaceId: defect.workspaceId,
    data: { origin: defect.origin, stage: defect.stage },
  });

  return { ...defect, ...data, id, status: "open", createdAt: new Date(rows[0].record_created_at).toISOString() };
}

export async function createReviewerDefect(request: CreateQaDefectRequest, createdBy: string): Promise<QaDefect> {
  return recordDefect({ ...request, findingId: null, origin: "reviewer", createdBy });
}

export async function listDefects(): Promise<QaDefect[]> {
  const rows = (await getDatabase()`
    SELECT * FROM qa_defects ORDER BY record_created_at DESC LIMIT ${MAX_LISTED}
  `) as DefectRow[];

  return rows.map(toDefect);
}

export function parseDefectRequest(value: unknown): CreateQaDefectRequest | null {
  const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const text = (key: string, max: number) =>
    typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
  const pick = <T extends string>(key: string, allowed: readonly T[]) =>
    allowed.includes(body[key] as T) ? (body[key] as T) : null;
  const uuid = (key: string) =>
    typeof body[key] === "string" && /^[0-9a-f-]{36}$/i.test(body[key] as string) ? (body[key] as string) : null;
  const stage = pick("stage", ["setup", "lesson", "video", "harness"] as const);
  const category = pick("category", [
    "qa_missed",
    "false_alarm",
    "wrong_fix",
    "harness_bug",
    "kyron_output",
    "source_problem",
    "cost_or_performance",
  ] as const);
  const severity = pick("severity", ["critical", "major", "minor"] as const);
  const title = text("title", 200);

  if (!stage || !category || !severity || !title) {
    return null;
  }

  return {
    stage,
    category,
    severity,
    title,
    expected: text("expected", 4000),
    actual: text("actual", 4000),
    evidence: text("evidence", 4000),
    workspaceId: uuid("workspaceId"),
    runId: uuid("runId"),
  };
}

function toDefect(row: DefectRow): QaDefect {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    findingId: row.finding_id,
    stage: row.stage,
    category: row.category,
    severity: row.severity,
    status: row.status,
    origin: row.origin,
    title: row.data.title,
    expected: row.data.expected,
    actual: row.data.actual,
    evidence: row.data.evidence,
    rootCause: row.data.rootCause,
    createdBy: row.created_by,
    createdAt: new Date(row.record_created_at).toISOString(),
  };
}
