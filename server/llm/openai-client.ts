import "server-only";

import OpenAI, { APIError } from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

import { getOpenAIEnv } from "@/server/env";
import { recordLlmUsage } from "@/server/logging/writer";

type RequestOptions = Parameters<OpenAI["responses"]["create"]>[1];

// "gateway": Vercel AI Gateway with AI_GATEWAY_API_KEY; "openai": OpenAI direct.
export type LlmRoute = "gateway" | "openai";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

let responsesClient: { client: OpenAI; route: LlmRoute } | undefined;
let directClient: OpenAI | null | undefined;

// Every Responses call goes through here so its tokens, latency and estimated
// cost are recorded in the usage log under `purpose`. The model name and the
// request (reasoning effort, structured output, store: false) are the same on
// both routes; the gateway only needs the "openai/" prefix and is pinned to
// OpenAI as the provider.
export async function createLoggedResponse(
  purpose: string,
  params: ResponseCreateParamsNonStreaming,
  options?: RequestOptions,
): Promise<Response> {
  const startedAt = Date.now();
  const model = String(params.model);
  const { client, route } = getResponsesClient();

  try {
    const response = await client.responses.create(toRouteParams(params, route), options);

    await recordLlmUsage({
      purpose,
      model,
      route,
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
      route,
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

// The client for Responses calls: the gateway when its key is set.
export function getResponsesClient(): { client: OpenAI; route: LlmRoute } {
  if (!responsesClient) {
    const env = getOpenAIEnv();

    responsesClient = env.AI_GATEWAY_API_KEY
      ? { client: new OpenAI({ apiKey: env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), route: "gateway" }
      : { client: new OpenAI({ apiKey: env.OPENAI_API_KEY ?? "" }), route: "openai" };
  }

  return responsesClient;
}

// OpenAI direct, for audio transcription, which the gateway does not serve
// through the OpenAI API. Null when OPENAI_API_KEY is not set.
export function getDirectOpenAIClient(): OpenAI | null {
  if (directClient === undefined) {
    const apiKey = getOpenAIEnv().OPENAI_API_KEY;

    directClient = apiKey ? new OpenAI({ apiKey }) : null;
  }

  return directClient;
}

// The gateway names models "openai/<model>" and may route a model to more
// than one provider; pinning to OpenAI keeps the same model and behavior.
export function toRouteParams(
  params: ResponseCreateParamsNonStreaming,
  route: LlmRoute,
): ResponseCreateParamsNonStreaming {
  if (route === "openai") {
    return params;
  }

  const model = String(params.model);

  return {
    ...params,
    model: model.includes("/") ? model : `openai/${model}`,
    ...{ providerOptions: { gateway: { only: ["openai"] } } },
  };
}

function errorCode(error: unknown): string {
  if (error instanceof APIError) {
    return [error.status, error.code ?? error.type].filter(Boolean).join(" ") || "api_error";
  }

  return error instanceof Error ? error.name : "unknown_error";
}
