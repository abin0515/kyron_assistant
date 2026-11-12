import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clients: [] as Array<{ apiKey: string; baseURL?: string }>,
  requests: [] as Array<Record<string, unknown>>,
  usage: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/logging/writer", () => ({
  recordLlmUsage: async (input: Record<string, unknown>) => {
    mocks.usage.push(input);
  },
}));
vi.mock("openai", () => {
  class APIError extends Error {}

  class OpenAI {
    responses = {
      create: async (params: Record<string, unknown>) => {
        mocks.requests.push(params);

        return {
          status: "completed",
          output_text: "{}",
          usage: {
            input_tokens: 120,
            output_tokens: 40,
            input_tokens_details: { cached_tokens: 20 },
            output_tokens_details: { reasoning_tokens: 15 },
          },
        };
      },
    };

    constructor(options: { apiKey: string; baseURL?: string }) {
      mocks.clients.push(options);
    }
  }

  return { default: OpenAI, APIError };
});

const ENV_NAMES = ["AI_GATEWAY_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL"] as const;

beforeEach(() => {
  vi.resetModules();
  mocks.clients = [];
  mocks.requests = [];
  mocks.usage = [];
  ENV_NAMES.forEach((name) => delete process.env[name]);
});

afterEach(() => {
  ENV_NAMES.forEach((name) => delete process.env[name]);
});

async function client() {
  return import("@/server/llm/openai-client");
}

const request = {
  model: "gpt-6-luna",
  input: "Check this lesson.",
  reasoning: { effort: "medium" as const },
  store: false,
  text: { format: { type: "json_schema" as const, name: "check", strict: true, schema: { type: "object" } } },
};

describe("model calls with the Vercel AI Gateway key", () => {
  it("sends the same model and reasoning through the gateway, pinned to OpenAI", async () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test";
    process.env.OPENAI_API_KEY = "sk-test";

    const { createLoggedResponse } = await client();

    await createLoggedResponse("qa.fidelity", request);

    expect(mocks.clients[0]).toEqual({ apiKey: "vck_test", baseURL: "https://ai-gateway.vercel.sh/v1" });
    expect(mocks.requests[0]).toEqual({
      ...request,
      model: "openai/gpt-6-luna",
      providerOptions: { gateway: { only: ["openai"] } },
    });
    expect(mocks.usage[0]).toMatchObject({
      purpose: "qa.fidelity",
      model: "gpt-6-luna",
      route: "gateway",
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 40,
      reasoningTokens: 15,
    });
  });

  it("keeps the high reasoning level of the verifier", async () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test";

    const { toRouteParams } = await client();

    expect(toRouteParams({ ...request, reasoning: { effort: "high" } }, "gateway")).toMatchObject({
      model: "openai/gpt-6-luna",
      reasoning: { effort: "high" },
      store: false,
    });
  });

  it("calls OpenAI directly, unchanged, without the gateway key", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const { createLoggedResponse } = await client();

    await createLoggedResponse("setup.generate", request);

    expect(mocks.clients[0]).toEqual({ apiKey: "sk-test" });
    expect(mocks.requests[0]).toEqual(request);
    expect(mocks.usage[0]).toMatchObject({ model: "gpt-6-luna", route: "openai" });
  });

  it("ignores placeholder keys and explains which key is missing", async () => {
    process.env.AI_GATEWAY_API_KEY = "replace_with_your_vercel_ai_gateway_key";
    process.env.OPENAI_API_KEY = "";

    const { getResponsesClient } = await client();

    expect(() => getResponsesClient()).toThrow("Set AI_GATEWAY_API_KEY (Vercel AI Gateway) or OPENAI_API_KEY.");
  });

  it("has no transcription client with only the gateway key", async () => {
    process.env.AI_GATEWAY_API_KEY = "vck_test";

    const { getDirectOpenAIClient } = await client();
    const { transcriptionAvailable } = await import("@/server/qa/transcription");

    expect(getDirectOpenAIClient()).toBeNull();
    expect(transcriptionAvailable()).toBe(false);
  });
});
