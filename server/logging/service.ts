import "server-only";

import type { CurrentUser } from "@/server/identity/current-user";
import type { PageRequest } from "@/server/http/pagination";
import { paginationMeta } from "@/server/http/pagination";
import { listContentVersions } from "@/server/qa/repository";
import type {
  CreateModelPriceRequest,
  LlmUsageListResponse,
  LogEventListResponse,
  LogSummaryResponse,
  ModelPriceListResponse,
  PurgeLogsResponse,
  QaContentVersion,
} from "@/types/api";

import {
  insertPrice,
  listExportRows,
  listLlmUsage,
  listLogEvents,
  listPrices,
  purgeLogsOlderThan,
  summarizeUsageBy,
  summarizeUsageSince,
  type LogEventFilter,
} from "./repository";
import { logEvent } from "./writer";

const SUMMARY_WINDOWS = [
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
];
const BREAKDOWN_HOURS = 24 * 30;
const MAX_EXPORT_ROWS = 5_000;

export async function getLogSummary(): Promise<LogSummaryResponse> {
  const [windows, byModel, byPurpose] = await Promise.all([
    Promise.all(
      SUMMARY_WINDOWS.map(async (window) => ({
        ...window,
        ...(await summarizeUsageSince(window.hours)),
      })),
    ),
    summarizeUsageBy("model", BREAKDOWN_HOURS),
    summarizeUsageBy("purpose", BREAKDOWN_HOURS),
  ]);

  return {
    windows,
    byModel: byModel.map(({ key, ...totals }) => ({ ...totals, model: key })),
    byPurpose: byPurpose.map(({ key, ...totals }) => ({ ...totals, purpose: key })),
    generatedAt: new Date().toISOString(),
  };
}

export async function getLogEvents(
  filter: LogEventFilter,
  page: PageRequest,
): Promise<LogEventListResponse> {
  const result = await listLogEvents(filter, page);

  return { events: result.items, pagination: paginationMeta(page, result.totalCount) };
}

export async function getLlmUsage(page: PageRequest): Promise<LlmUsageListResponse> {
  const result = await listLlmUsage(page);

  return { usage: result.items, pagination: paginationMeta(page, result.totalCount) };
}

export type LogExportKind = "events" | "usage" | "versions";

export async function exportLogs(
  kind: LogExportKind,
  format: "csv" | "json",
): Promise<{ body: string; contentType: string; fileName: string }> {
  const rows = kind === "versions" ? await listVersionExportRows(format) : await listExportRows(kind, MAX_EXPORT_ROWS);
  const stamp = new Date().toISOString().slice(0, 10);

  return format === "json"
    ? {
        body: JSON.stringify(rows, null, 2),
        contentType: "application/json; charset=utf-8",
        fileName: `cpe-${kind}-${stamp}.json`,
      }
    : {
        body: toCsv(rows as Array<Record<string, unknown>>),
        contentType: "text/csv; charset=utf-8",
        fileName: `cpe-${kind}-${stamp}.csv`,
      };
}

export async function getModelPrices(): Promise<ModelPriceListResponse> {
  return { prices: await listPrices() };
}

// Prices are never edited in place: a new row takes effect now, so earlier
// usage keeps the cost it was recorded with.
export async function addModelPrice(
  request: CreateModelPriceRequest,
  user: CurrentUser,
): Promise<ModelPriceListResponse> {
  await insertPrice({
    provider: "openai",
    model: request.model,
    inputUsdPerMillion: request.inputUsdPerMillion,
    cachedInputUsdPerMillion: request.cachedInputUsdPerMillion,
    outputUsdPerMillion: request.outputUsdPerMillion,
    effectiveFrom: new Date().toISOString(),
    note: request.note || `Added by ${user.name}`,
  });
  await logEvent({
    category: "system",
    event: "pricing.added",
    message: `${user.name} set ${request.model} to $${request.inputUsdPerMillion} in / $${request.outputUsdPerMillion} out per 1M tokens.`,
    actorId: user.id,
    actorRole: user.role,
  });

  return getModelPrices();
}

export async function purgeLogs(olderThanDays: number, user: CurrentUser): Promise<PurgeLogsResponse> {
  const result = await purgeLogsOlderThan(olderThanDays);

  await logEvent({
    category: "system",
    event: "logs.purged",
    level: "warn",
    message: `${user.name} deleted ${result.deletedEvents} events and ${result.deletedUsage} usage records older than ${olderThanDays} days.`,
    actorId: user.id,
    actorRole: user.role,
  });

  return result;
}

// JSON keeps each version whole; CSV has one row per changed field.
async function listVersionExportRows(format: "csv" | "json"): Promise<Array<Record<string, unknown>>> {
  const { items } = await listContentVersions({}, { page: 1, pageSize: MAX_EXPORT_ROWS });

  return format === "json" ? items : items.flatMap(versionCsvRows);
}

function versionCsvRows(version: QaContentVersion): Array<Record<string, unknown>> {
  const base = {
    createdAt: version.createdAt,
    lesson: version.lessonTitle,
    target: version.target,
    version: version.versionNumber,
    status: version.status,
    author: version.author,
    model: version.model,
    source: version.source,
    kyronDraftId: version.kyronDraftId,
    runId: version.runId,
    versionId: version.id,
    summary: version.summary,
  };
  const empty = { activityId: null, fieldPath: null, before: null, after: null, rationale: null, criteria: null };

  return version.changes.length === 0
    ? [{ ...base, ...empty }]
    : version.changes.map((change) => ({
        ...base,
        activityId: change.activityId,
        fieldPath: change.fieldPath,
        before: change.before,
        after: change.after,
        rationale: change.rationale,
        criteria: change.criterionIds.join(" "),
      }));
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}
