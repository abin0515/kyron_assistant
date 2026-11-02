import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  KyronMcpCapabilityManifest,
  KyronMcpConnectionResponse,
  KyronMcpToolCallRequest,
  KyronMcpToolCallResponse,
} from "@/types/api";

export async function getKyronConnection(
  signal?: AbortSignal,
): Promise<KyronMcpConnectionResponse> {
  const response = await fetch("/api/kyron-mcp/connection", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<KyronMcpConnectionResponse>(response);
}

export async function disconnectKyronConnection(): Promise<KyronMcpConnectionResponse> {
  const response = await fetch("/api/kyron-mcp/connection", {
    method: "DELETE",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
  });

  return parseJsonResponse<KyronMcpConnectionResponse>(response);
}

export async function getKyronCapabilities(
  signal?: AbortSignal,
): Promise<KyronMcpCapabilityManifest> {
  const response = await fetch("/api/kyron-mcp/tools", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<KyronMcpCapabilityManifest>(response);
}

export async function runKyronTool(
  request: KyronMcpToolCallRequest,
  signal?: AbortSignal,
): Promise<KyronMcpToolCallResponse> {
  const response = await fetch("/api/kyron-mcp/tools/call", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<KyronMcpToolCallResponse>(response);
}
