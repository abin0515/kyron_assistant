import { NextRequest, NextResponse } from "next/server";

import {
  kyronMcpErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { callKyronReadOnlyTool } from "@/server/kyron-mcp/service";
import type {
  KyronMcpToolCallRequest,
  KyronMcpToolCallResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_TOOL_NAME_LENGTH = 200;
const MAX_ARGUMENTS_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    await requireCurrentUserRole("admin");

    const body = parseToolCallRequest(await request.text());

    if (!body) {
      return requestErrorResponse(
        "Send a tool name and a JSON object of arguments (64 KB at most).",
      );
    }

    return NextResponse.json(
      (await callKyronReadOnlyTool(
        body.name,
        body.arguments,
      )) satisfies KyronMcpToolCallResponse,
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron MCP tool call failed",
      fallbackMessage: "The Kyron tool could not be run.",
    });
  }
}

function parseToolCallRequest(text: string): KyronMcpToolCallRequest | null {
  if (new TextEncoder().encode(text).length > MAX_ARGUMENTS_BYTES) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);

    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "arguments" in value &&
      typeof value.name === "string" &&
      value.name.trim() &&
      value.name.length <= MAX_TOOL_NAME_LENGTH &&
      typeof value.arguments === "object" &&
      value.arguments !== null &&
      !Array.isArray(value.arguments)
    ) {
      return {
        name: value.name,
        arguments: value.arguments as Record<string, unknown>,
      };
    }
  } catch {
    // Invalid JSON is reported with the same validation message.
  }

  return null;
}
