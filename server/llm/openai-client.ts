import "server-only";

import OpenAI, { APIError } from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

import { getOpenAIEnv } from "@/server/env";
import { recordLlmUsage } from "@/server/logging/writer";

type RequestOptions = Parameters<OpenAI["responses"]["create"]>[1];

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: getOpenAIEnv().OPENAI_API_KEY,
    });
  }

  return client;
}

// Every Responses call goes through here so its tokens, latency and estimated
// cost are recorded in the usage log under `purpose`.
export async function createLoggedResponse(
  purpose: string,
  params: ResponseCreateParamsNonStreaming,
  options?: RequestOptions,
): Promise<Response> {
  const startedAt = Date.now();
  const model = String(params.model);

  try {
    const response = await getOpenAIClient().responses.create(params, options);

    await recordLlmUsage({
      purpose,
      model,
      status: response.status === "incomplete" ? "incomplete" : "completed",
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      errorCode: null,
      providerRequestId: (response as { _request_id?: string | null })._request_id ?? null,
    });

    return response;
  } catch (error) {
    await recordLlmUsage({
      purpose,
      model,
      status: "error",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      latencyMs: Date.now() - startedAt,
      errorCode: errorCode(error),
    });

    throw error;
  }
}

function errorCode(error: unknown): string {
  if (error instanceof APIError) {
    return [error.status, error.code ?? error.type].filter(Boolean).join(" ") || "api_error";
  }

  return error instanceof Error ? error.name : "unknown_error";
}
