import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabase } from "@/server/db/client";
import { pageOffset, type PageRequest, type PageResult } from "@/server/http/pagination";
import type {
  LlmUsageItem,
  LogCategory,
  LogEventItem,
  LogLevel,
  ModelPriceItem,
  UsageTotals,
} from "@/types/api";

import type { ModelPrice } from "./cost";

export type NewLogEvent = Omit<LogEventItem, "id" | "occurredAt"> & { requestId: string | null };
export type NewLlmUsage = Omit<LlmUsageItem, "id" | "occurredAt"> & {
  pricingId: string | null;
  providerRequestId: string | null;
};

export type LogEventFilter = {
  category?: LogCategory;
  level?: LogLevel;
  search?: string;
  qaRunId?: string;
};

type EventRow = {
  id: string;
  occurred_at: string | Date;
  level: LogLevel;
  category: LogCategory;
  event: string;
  message: string;
  actor_id: string | null;
  actor_role: string | null;
  qa_run_id: string | null;
  workspace_id: string | null;
  kyron_draft_id: string | number | null;
  duration_ms: number | null;
  data: Record<string, unknown>;
  total_count?: string | number;
};

type UsageRow = {
  id: string;
  occurred_at: string | Date;
  purpose: string;
  provider: string;
  model: string;
  status: LlmUsageItem["status"];
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  estimated_cost_usd: string | number | null;
  latency_ms: number | null;
  error_code: string | null;
  actor_id: string | null;
  qa_run_id: string | null;
  workspace_id: string | null;
  total_count?: string | number;
};

type TotalsRow = {
  calls: string | number;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  reasoning_tokens: string | number | null;
  cost_usd: string | number | null;
  unpriced_calls: string | number;
  failed_calls: string | number;
};

type PriceRow = {
  id: string;
  provider: string;
  model: string;
  input_usd_per_million: string | number;
  cached_input_usd_per_million: string | number;
  output_usd_per_million: string | number;
  effective_from: string | Date;
  note: string;
};

export async function insertLogEvent(event: NewLogEvent): Promise<void> {
  await getDatabase()`
    INSERT INTO app_log_events (
      id, level, category, event, message, actor_id, actor_role, request_id,
      qa_run_id, workspace_id, kyron_draft_id, duration_ms, data
    )
    VALUES (
      ${randomUUID()}, ${event.level}, ${event.category}, ${event.event}, ${event.message},
      ${event.actorId}, ${event.actorRole}, ${event.requestId}, ${event.qaRunId},
      ${event.workspaceId}, ${event.kyronDraftId}, ${event.durationMs},
      ${JSON.stringify(event.data)}::JSONB
    )
  `;
}

export async function insertLlmUsage(usage: NewLlmUsage): Promise<void> {
  await getDatabase()`
    INSERT INTO llm_usage_events (
      id, purpose, provider, model, status, input_tokens, cached_input_tokens,
      output_tokens, reasoning_tokens, estimated_cost_usd, pricing_id, latency_ms,
      error_code, actor_id, qa_run_id, workspace_id, provider_request_id
    )
    VALUES (
      ${randomUUID()}, ${usage.purpose}, ${usage.provider}, ${usage.model}, ${usage.status},
      ${usage.inputTokens}, ${usage.cachedInputTokens}, ${usage.outputTokens},
      ${usage.reasoningTokens}, ${usage.estimatedCostUsd}, ${usage.pricingId},
      ${usage.latencyMs}, ${usage.errorCode}, ${usage.actorId}, ${usage.qaRunId},
      ${usage.workspaceId}, ${usage.providerRequestId}
    )
  `;
}

export async function listLogEvents(
  filter: LogEventFilter,
  page: PageRequest,
): Promise<PageResult<LogEventItem>> {
  const search = filter.search?.trim() ? `%${filter.search.trim()}%` : null;
  const rows = (await getDatabase()`
    SELECT *, COUNT(*) OVER () AS total_count
    FROM app_log_events
    WHERE (${filter.category ?? null}::TEXT IS NULL OR category = ${filter.category ?? null})
      AND (${filter.level ?? null}::TEXT IS NULL OR level = ${filter.level ?? null})
      AND (${filter.qaRunId ?? null}::UUID IS NULL OR qa_run_id = ${filter.qaRunId ?? null})
      AND (${search}::TEXT IS NULL OR message ILIKE ${search} OR event ILIKE ${search})
    ORDER BY occurred_at DESC
    LIMIT ${page.pageSize} OFFSET ${pageOffset(page)}
  `) as EventRow[];

  return { items: rows.map(toLogEvent), totalCount: Number(rows[0]?.total_count ?? 0) };
}

export async function listLlmUsage(page: PageRequest): Promise<PageResult<LlmUsageItem>> {
  const rows = (await getDatabase()`
    SELECT *, COUNT(*) OVER () AS total_count
    FROM llm_usage_events
    ORDER BY occurred_at DESC
    LIMIT ${page.pageSize} OFFSET ${pageOffset(page)}
  `) as UsageRow[];

  return { items: rows.map(toLlmUsage), totalCount: Number(rows[0]?.total_count ?? 0) };
}

export async function summarizeUsageSince(hours: number): Promise<{ usage: UsageTotals; errorEvents: number }> {
  const sql = getDatabase();
  const usageRows = (await sql.query(
    `
      SELECT ${TOTALS_TEXT}
      FROM llm_usage_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 hour')
    `,
    [hours],
  )) as TotalsRow[];
  const errorRows = (await sql`
    SELECT COUNT(*) AS errors
    FROM app_log_events
    WHERE level = 'error' AND occurred_at >= NOW() - (${hours} * INTERVAL '1 hour')
  `) as Array<{ errors: string | number }>;

  return { usage: toTotals(usageRows[0]), errorEvents: Number(errorRows[0]?.errors ?? 0) };
}

export async function summarizeUsageBy(
  dimension: "model" | "purpose",
  hours: number,
): Promise<Array<UsageTotals & { key: string }>> {
  const rows = (await getDatabase().query(
    `
      SELECT ${dimension} AS key, ${TOTALS_TEXT}
      FROM llm_usage_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 hour')
      GROUP BY ${dimension}
      ORDER BY COALESCE(SUM(input_tokens + output_tokens), 0) DESC
      LIMIT 20
    `,
    [hours],
  )) as Array<TotalsRow & { key: string }>;

  return rows.map((row) => ({ ...toTotals(row), key: row.key }));
}

export async function listExportRows(
  kind: "events" | "usage",
  limit: number,
): Promise<Array<LogEventItem | LlmUsageItem>> {
  const sql = getDatabase();

  if (kind === "events") {
    const rows = (await sql`
      SELECT * FROM app_log_events ORDER BY occurred_at DESC LIMIT ${limit}
    `) as EventRow[];

    return rows.map(toLogEvent);
  }

  const rows = (await sql`
    SELECT * FROM llm_usage_events ORDER BY occurred_at DESC LIMIT ${limit}
  `) as UsageRow[];

  return rows.map(toLlmUsage);
}

// The price in effect at a moment: the newest row that started before it.
export async function findPriceAt(provider: string, model: string, at: Date): Promise<ModelPrice | null> {
  const rows = (await getDatabase()`
    SELECT id, input_usd_per_million, cached_input_usd_per_million, output_usd_per_million
    FROM model_pricing
    WHERE provider = ${provider} AND model = ${model} AND effective_from <= ${at.toISOString()}
    ORDER BY effective_from DESC
    LIMIT 1
  `) as PriceRow[];
  const row = rows[0];

  return row
    ? {
        id: row.id,
        inputUsdPerMillion: Number(row.input_usd_per_million),
        cachedInputUsdPerMillion: Number(row.cached_input_usd_per_million),
        outputUsdPerMillion: Number(row.output_usd_per_million),
      }
    : null;
}

export async function listPrices(): Promise<ModelPriceItem[]> {
  const rows = (await getDatabase()`
    SELECT * FROM model_pricing ORDER BY model, effective_from DESC
  `) as PriceRow[];

  return rows.map(toPrice);
}

export async function insertPrice(price: Omit<ModelPriceItem, "id">): Promise<void> {
  await getDatabase()`
    INSERT INTO model_pricing (
      id, provider, model, input_usd_per_million, cached_input_usd_per_million,
      output_usd_per_million, effective_from, note
    )
    VALUES (
      ${randomUUID()}, ${price.provider}, ${price.model}, ${price.inputUsdPerMillion},
      ${price.cachedInputUsdPerMillion}, ${price.outputUsdPerMillion},
      ${price.effectiveFrom}, ${price.note}
    )
  `;
}

export async function purgeLogsOlderThan(days: number): Promise<{ deletedEvents: number; deletedUsage: number }> {
  const sql = getDatabase();
  const events = (await sql`
    DELETE FROM app_log_events
    WHERE occurred_at < NOW() - (${days} * INTERVAL '1 day')
    RETURNING id
  `) as Array<{ id: string }>;
  const usage = (await sql`
    DELETE FROM llm_usage_events
    WHERE occurred_at < NOW() - (${days} * INTERVAL '1 day')
    RETURNING id
  `) as Array<{ id: string }>;

  return { deletedEvents: events.length, deletedUsage: usage.length };
}

const TOTALS_TEXT = `
  COUNT(*) AS calls,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(reasoning_tokens) AS reasoning_tokens,
  SUM(estimated_cost_usd) AS cost_usd,
  COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL AND status <> 'error') AS unpriced_calls,
  COUNT(*) FILTER (WHERE status = 'error') AS failed_calls
`;

function toTotals(row: TotalsRow | undefined): UsageTotals {
  return {
    calls: Number(row?.calls ?? 0),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    reasoningTokens: Number(row?.reasoning_tokens ?? 0),
    costUsd: Number(row?.cost_usd ?? 0),
    unpricedCalls: Number(row?.unpriced_calls ?? 0),
    failedCalls: Number(row?.failed_calls ?? 0),
  };
}

function toLogEvent(row: EventRow): LogEventItem {
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    level: row.level,
    category: row.category,
    event: row.event,
    message: row.message,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    qaRunId: row.qa_run_id,
    workspaceId: row.workspace_id,
    kyronDraftId: row.kyron_draft_id === null ? null : Number(row.kyron_draft_id),
    durationMs: row.duration_ms,
    data: row.data ?? {},
  };
}

function toLlmUsage(row: UsageRow): LlmUsageItem {
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    latencyMs: row.latency_ms,
    errorCode: row.error_code,
    actorId: row.actor_id,
    qaRunId: row.qa_run_id,
    workspaceId: row.workspace_id,
  };
}

function toPrice(row: PriceRow): ModelPriceItem {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    inputUsdPerMillion: Number(row.input_usd_per_million),
    cachedInputUsdPerMillion: Number(row.cached_input_usd_per_million),
    outputUsdPerMillion: Number(row.output_usd_per_million),
    effectiveFrom: new Date(row.effective_from).toISOString(),
    note: row.note,
  };
}
