import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type {
  KyronMcpCapabilityManifest,
  KyronMcpContentItem,
  KyronMcpToolCallResponse,
  KyronMcpToolSummary,
} from "@/types/api";

import { KyronMcpError } from "./errors";

const CLIENT_INFO = { name: "cpe-course-studio", version: "0.1.0" };
const CONNECT_TIMEOUT_MS = 30_000;
const LIST_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 120_000;
const MAX_TOOL_PAGES = 20;
const MAX_RESULT_TEXT_CHARACTERS = 200_000;
const MAX_ERROR_DETAIL_LENGTH = 300;

export class KyronMcpUnauthorizedError extends KyronMcpError {
  constructor() {
    super(
      "KYRON_MCP_NOT_CONNECTED",
      "Kyron rejected the saved sign-in. Connect Kyron again.",
    );
    this.name = "KyronMcpUnauthorizedError";
  }
}

export async function withKyronMcpClient<T>(
  mcpUrl: string,
  accessToken: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });

    return await run(client);
  } catch (error) {
    throw normalizeMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const result = await client.listTools(cursor ? { cursor } : undefined, {
      timeout: LIST_TIMEOUT_MS,
    });

    tools.push(...result.tools);
    cursor = result.nextCursor;

    if (!cursor) {
      break;
    }
  }

  return tools;
}

export function describeServer(
  client: Client,
): Omit<KyronMcpCapabilityManifest, "fetchedAt" | "tools"> {
  const version = client.getServerVersion();

  return {
    server: version
      ? {
          name: version.name,
          version: version.version,
          title: typeof version.title === "string" ? version.title : null,
        }
      : null,
    instructions: client.getInstructions() ?? null,
    capabilities: client.getServerCapabilities() ?? null,
  };
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: CALL_TIMEOUT_MS },
  )) as CallToolResult;
}

// Explorer calls are limited to tools Kyron marks read-only, plus tools the
// admin lists in KYRON_MCP_READ_TOOLS after reviewing their descriptions.
export function isExplorerAllowedTool(
  tool: Pick<Tool, "name" | "annotations">,
  allowlist: readonly string[],
): boolean {
  return tool.annotations?.readOnlyHint === true || allowlist.includes(tool.name);
}

export function summarizeTool(
  tool: Tool,
  allowlist: readonly string[],
): KyronMcpToolSummary {
  const annotations = tool.annotations;

  return {
    name: tool.name,
    title: tool.title ?? annotations?.title ?? null,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? null,
    annotations: annotations
      ? {
          title: annotations.title,
          readOnlyHint: annotations.readOnlyHint,
          destructiveHint: annotations.destructiveHint,
          idempotentHint: annotations.idempotentHint,
          openWorldHint: annotations.openWorldHint,
        }
      : null,
    explorerAllowed: isExplorerAllowedTool(tool, allowlist),
  };
}

export function summarizeToolResult(
  result: CallToolResult,
): KyronMcpToolCallResponse["result"] {
  let remaining = MAX_RESULT_TEXT_CHARACTERS;
  let truncated = false;

  function limitText(text: string): string {
    if (text.length <= remaining) {
      remaining -= text.length;
      return text;
    }

    truncated = true;
    const kept = text.slice(0, Math.max(remaining, 0));
    remaining = 0;

    return kept;
  }

  const content = (result.content ?? []).map((item) =>
    summarizeContentItem(item, limitText),
  );
  const structured = limitStructuredContent(result.structuredContent);

  return {
    isError: result.isError === true,
    content,
    structuredContent: structured.value,
    truncated: truncated || structured.truncated,
  };
}

// Kyron returns data either as structured content or as JSON text. Tool
// errors, such as "Access forbidden", become a KyronMcpError.
export function readToolResultData(name: string, result: CallToolResult): unknown {
  const text = (result.content ?? []).find((item) => item.type === "text")?.text ?? "";

  if (result.isError) {
    throw new KyronMcpError("KYRON_INVALID_RESPONSE", `Kyron ${name} failed: ${errorMessageFrom(text)}`);
  }

  if (result.structuredContent) {
    return result.structuredContent;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new KyronMcpError("KYRON_INVALID_RESPONSE", `Kyron ${name} returned unreadable output.`);
  }
}

function errorMessageFrom(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string") {
      return parsed.message.slice(0, MAX_ERROR_DETAIL_LENGTH);
    }
  } catch {
    // Plain-text errors are used as they are.
  }

  return text.slice(0, MAX_ERROR_DETAIL_LENGTH) || "no details";
}

function summarizeContentItem(
  item: unknown,
  limitText: (text: string) => string,
): KyronMcpContentItem {
  const record =
    typeof item === "object" && item !== null
      ? (item as Record<string, unknown>)
      : {};

  if (record.type === "text" && typeof record.text === "string") {
    return { type: "text", text: limitText(record.text) };
  }

  if (
    (record.type === "image" || record.type === "audio") &&
    typeof record.data === "string"
  ) {
    return {
      type: record.type,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
      byteLength: Math.floor((record.data.length * 3) / 4),
    };
  }

  if (record.type === "resource_link" && typeof record.uri === "string") {
    return {
      type: "resource_link",
      uri: record.uri,
      name: typeof record.name === "string" ? record.name : null,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : null,
    };
  }

  if (record.type === "resource" && typeof record.resource === "object" && record.resource) {
    const resource = record.resource as Record<string, unknown>;

    return {
      type: "resource",
      uri: typeof resource.uri === "string" ? resource.uri : "",
      mimeType: typeof resource.mimeType === "string" ? resource.mimeType : null,
      text: typeof resource.text === "string" ? limitText(resource.text) : null,
      byteLength:
        typeof resource.blob === "string"
          ? Math.floor((resource.blob.length * 3) / 4)
          : null,
    };
  }

  return { type: "unknown", raw: item };
}

function limitStructuredContent(value: unknown): {
  value: unknown;
  truncated: boolean;
} {
  if (value === undefined || value === null) {
    return { value: null, truncated: false };
  }

  const serialized = JSON.stringify(value);

  if (serialized.length <= MAX_RESULT_TEXT_CHARACTERS) {
    return { value, truncated: false };
  }

  return {
    value: { preview: serialized.slice(0, MAX_RESULT_TEXT_CHARACTERS) },
    truncated: true,
  };
}

function normalizeMcpError(error: unknown): unknown {
  if (error instanceof KyronMcpError) {
    return error;
  }

  if (error instanceof StreamableHTTPError) {
    if (error.code === 401) {
      return new KyronMcpUnauthorizedError();
    }

    if (error.code === 403) {
      return new KyronMcpError(
        "KYRON_MCP_NOT_CONNECTED",
        "Kyron refused this request for the connected account.",
      );
    }

    return new KyronMcpError(
      "KYRON_MCP_UNAVAILABLE",
      `Kyron MCP returned HTTP ${error.code ?? "error"}.`,
      true,
    );
  }

  if (error instanceof McpError) {
    return new KyronMcpError(
      "KYRON_MCP_UNAVAILABLE",
      error.code === ErrorCode.RequestTimeout
        ? "Kyron MCP did not respond in time."
        : `Kyron MCP returned an error: ${error.message.slice(0, MAX_ERROR_DETAIL_LENGTH)}`,
      error.code === ErrorCode.RequestTimeout,
    );
  }

  if (error instanceof TypeError) {
    return new KyronMcpError(
      "KYRON_MCP_UNAVAILABLE",
      "Kyron MCP could not be reached.",
      true,
    );
  }

  return error;
}
