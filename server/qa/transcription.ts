import "server-only";

import { toFile } from "openai";

import { getDirectOpenAIClient } from "@/server/llm/openai-client";
import { recordLlmUsage } from "@/server/logging/writer";

import type { UsageRecord } from "./evaluators/types";

export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
export const TRANSCRIPTION_UNAVAILABLE =
  "Transcribing an uploaded video needs OPENAI_API_KEY; Vercel AI Gateway does not serve transcription through the OpenAI API.";

const TRANSCRIPTION_TIMEOUT_MS = 300_000;

export function transcriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe";
}

// Transcription always calls OpenAI directly.
export function transcriptionAvailable(): boolean {
  return getDirectOpenAIClient() !== null;
}

export async function transcribeMedia(
  bytes: Buffer,
  fileName: string,
): Promise<{ text: string; usage: UsageRecord }> {
  if (bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
    throw new Error("The media file is larger than the 25 MB transcription limit.");
  }

  const client = getDirectOpenAIClient();

  if (!client) {
    throw new Error(TRANSCRIPTION_UNAVAILABLE);
  }

  const startedAt = Date.now();
  const response = await client.audio.transcriptions.create(
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
    route: "openai",
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
