import "server-only";

import { toFile } from "openai";

import { getOpenAIClient } from "@/server/llm/openai-client";
import { recordLlmUsage } from "@/server/logging/writer";

import type { UsageRecord } from "./evaluators/types";

export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

const TRANSCRIPTION_TIMEOUT_MS = 300_000;

export function transcriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe";
}

export async function transcribeMedia(
  bytes: Buffer,
  fileName: string,
): Promise<{ text: string; usage: UsageRecord }> {
  if (bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
    throw new Error("The media file is larger than the 25 MB transcription limit.");
  }

  const startedAt = Date.now();
  const response = await getOpenAIClient().audio.transcriptions.create(
    {
      file: await toFile(bytes, fileName),
      model: transcriptionModel(),
      response_format: "json",
    },
    { timeout: TRANSCRIPTION_TIMEOUT_MS },
  );
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;

  await recordLlmUsage({
    purpose: "qa.media.transcription",
    model: transcriptionModel(),
    status: "completed",
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: 0,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningTokens: 0,
    latencyMs: Date.now() - startedAt,
    errorCode: null,
  });

  return {
    text: response.text,
    usage: {
      purpose: "qa.media.transcription",
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      reasoningTokens: 0,
    },
  };
}
