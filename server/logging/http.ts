import "server-only";

import { NextResponse } from "next/server";

import {
  identityErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
} from "@/server/http/api-response";
import type {
  CreateModelPriceRequest,
  LogCategory,
  LogLevel,
} from "@/types/api";

import type { LogEventFilter } from "./repository";

const CATEGORIES: readonly LogCategory[] = ["auth", "openai", "kyron_api", "kyron_mcp", "qa", "draft", "system"];
const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
const MAX_PRICE = 10_000;

export function logsJson(body: unknown) {
  return NextResponse.json(body, { headers: noStoreHeaders });
}

export function logsErrorResponse(error: unknown, context: string) {
  return (
    identityErrorResponse(error) ??
    internalErrorResponse(error, { context, fallbackMessage: "The log request failed.", retryable: true })
  );
}

export function parseEventFilter(searchParams: URLSearchParams): LogEventFilter {
  const category = searchParams.get("category");
  const level = searchParams.get("level");
  const qaRunId = searchParams.get("qaRunId");

  return {
    category: CATEGORIES.includes(category as LogCategory) ? (category as LogCategory) : undefined,
    level: LEVELS.includes(level as LogLevel) ? (level as LogLevel) : undefined,
    search: searchParams.get("q")?.slice(0, 200) || undefined,
    qaRunId: qaRunId && /^[0-9a-f-]{36}$/i.test(qaRunId) ? qaRunId : undefined,
  };
}

export function parsePriceRequest(value: unknown): CreateModelPriceRequest | null {
  const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const prices = [body.inputUsdPerMillion, body.cachedInputUsdPerMillion, body.outputUsdPerMillion];

  if (
    !/^[A-Za-z0-9._:-]{1,100}$/.test(model) ||
    !prices.every((price) => typeof price === "number" && Number.isFinite(price) && price >= 0 && price <= MAX_PRICE)
  ) {
    return null;
  }

  return {
    model,
    inputUsdPerMillion: body.inputUsdPerMillion as number,
    cachedInputUsdPerMillion: body.cachedInputUsdPerMillion as number,
    outputUsdPerMillion: body.outputUsdPerMillion as number,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
  };
}
