import "server-only";

import type { LlmUsageItem, LogCategory, LogLevel } from "@/types/api";

import { currentLogContext } from "./context";
import { estimateCostUsd } from "./cost";
import { redactSecrets, scrubData } from "./redact";
import { findPriceAt, insertLlmUsage, insertLogEvent } from "./repository";

const MAX_MESSAGE_LENGTH = 500;

export type LogEventInput = {
  category: LogCategory;
  event: string;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
  durationMs?: number | null;
  kyronDraftId?: number | null;
  qaRunId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
};

export type LlmUsageInput = Pick<
  LlmUsageItem,
  | "purpose"
  | "model"
  | "status"
  | "inputTokens"
  | "cachedInputTokens"
  | "outputTokens"
  | "reasoningTokens"
  | "latencyMs"
  | "errorCode"
> & {
  provider?: string;
  providerRequestId?: string | null;
};

// Logging is best effort: a failed write is reported on the console and never
// breaks the operation being logged.
export async function logEvent(input: LogEventInput): Promise<void> {
  const context = currentLogContext();
  const level = input.level ?? "info";
  const message = redactSecrets(input.message).slice(0, MAX_MESSAGE_LENGTH);

  mirrorToConsole(level, input.category, message);

  try {
    await insertLogEvent({
      level,
      category: input.category,
      event: input.event.slice(0, 120),
      message,
      data: scrubData(input.data ?? {}),
      durationMs: input.durationMs ?? null,
      kyronDraftId: input.kyronDraftId ?? null,
      qaRunId: input.qaRunId ?? context.qaRunId ?? null,
      workspaceId: input.workspaceId ?? context.workspaceId ?? null,
      actorId: input.actorId ?? context.actorId ?? null,
      actorRole: input.actorRole ?? context.actorRole ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (error) {
    console.error("Log event could not be stored.", {
      event: input.event,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function recordLlmUsage(input: LlmUsageInput): Promise<void> {
  const context = currentLogContext();
  const provider = input.provider ?? "openai";

  try {
    const price = await findPriceAt(provider, input.model, new Date());

    await insertLlmUsage({
      ...input,
      provider,
      estimatedCostUsd: input.status === "error" ? null : estimateCostUsd(input, price),
      pricingId: price?.id ?? null,
      providerRequestId: input.providerRequestId ?? null,
      actorId: context.actorId ?? null,
      qaRunId: context.qaRunId ?? null,
      workspaceId: context.workspaceId ?? null,
    });
  } catch (error) {
    console.error("Model usage could not be stored.", {
      purpose: input.purpose,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function mirrorToConsole(level: LogLevel, category: LogCategory, message: string): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const line = `[${category}] ${message}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
