import "server-only";

import { NextResponse } from "next/server";

import {
  conflictErrorResponse,
  kyronMcpErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import type {
  QaAuditRequest,
  QaFindingDecisionRequest,
  QaHumanCheckRequest,
  QaLessonContentRequest,
} from "@/types/api";

import { QaConflictError, QaNotFoundError, QaValidationError } from "./service";

const MAX_REASON_LENGTH = 2_000;

export type QaRouteContext<Params extends Record<string, string>> = {
  params: Promise<Params>;
};

export function qaJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export function qaErrorResponse(error: unknown, context: string) {
  if (error instanceof QaValidationError) {
    return validationErrorResponse({ request: error.errors });
  }

  if (error instanceof QaNotFoundError) {
    return notFoundErrorResponse(error.message);
  }

  if (error instanceof QaConflictError) {
    return conflictErrorResponse(error.message, false);
  }

  // Covers identity errors, Kyron MCP errors and unexpected failures.
  return kyronMcpErrorResponse(error, {
    context,
    fallbackMessage: "The QA request could not be completed.",
  });
}

export function isRecordId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();

    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseLessonContentRequest(
  body: Record<string, unknown> | null,
): QaLessonContentRequest | null {
  return body && body.packet !== undefined ? { packet: body.packet } : null;
}

export function parseDecisionRequest(
  body: Record<string, unknown> | null,
): QaFindingDecisionRequest | null {
  const outcome = body?.outcome;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (
    (outcome !== "accepted" && outcome !== "rejected" && outcome !== "waived") ||
    reason.length > MAX_REASON_LENGTH ||
    (outcome !== "accepted" && !reason)
  ) {
    return null;
  }

  return { outcome, reason };
}

export function parseHumanCheckRequest(
  body: Record<string, unknown> | null,
): QaHumanCheckRequest | null {
  const status = body?.status;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  return (status === "pass" || status === "fail") && note.length <= MAX_REASON_LENGTH
    ? { status, note }
    : null;
}

export function parseAuditRequest(body: Record<string, unknown> | null): QaAuditRequest | null {
  const outcome = body?.outcome;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  return (outcome === "pass" || outcome === "defect_found") && note.length <= MAX_REASON_LENGTH
    ? { outcome, note }
    : null;
}
