import "server-only";

import OpenAI from "openai";

import { getOpenAIEnv } from "@/server/env";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: getOpenAIEnv().OPENAI_API_KEY,
    });
  }

  return client;
}
