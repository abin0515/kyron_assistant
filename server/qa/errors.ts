import "server-only";

import {
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
} from "openai";

import { KyronMcpError } from "@/server/kyron-mcp/errors";
import { redactSecrets } from "@/server/logging/redact";

import { ContentSourceUnavailableError } from "./content-sources";

const MAX_MESSAGE_LENGTH = 300;

// Problems a retry cannot fix: the run stops with an actionable message
// instead of marking every remaining check as not tested.
export function configurationProblem(error: unknown): string | null {
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local (a key set in the Windows environment takes priority) and restart the dev server.";
  }

  if (error instanceof NotFoundError) {
    return "OpenAI does not recognize the configured model. Check OPENAI_QA_MODEL, OPENAI_MODEL or OPENAI_TRANSCRIPTION_MODEL.";
  }

  if (error instanceof ContentSourceUnavailableError) {
    return error.message;
  }

  if (
    error instanceof KyronMcpError &&
    (error.code === "KYRON_MCP_NOT_CONFIGURED" || error.code === "KYRON_MCP_NOT_CONNECTED")
  ) {
    return error.message;
  }

  return null;
}

// Error text is stored in run timelines, so credentials are scrubbed first.
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";

  return redactSecrets(message).slice(0, MAX_MESSAGE_LENGTH);
}
