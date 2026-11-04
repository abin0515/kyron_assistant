import "server-only";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { getKyronMcpEnv, getTokenEncryptionKey } from "@/server/env";
import { logEvent } from "@/server/logging/writer";
import type { CurrentUser } from "@/server/identity/current-user";
import type {
  KyronClientMetadataSetup,
  KyronMcpCapabilityManifest,
  KyronMcpConnectionStatus,
  KyronMcpToolCallResponse,
} from "@/types/api";

import { decryptJson, encryptJson } from "./encryption";
import { KyronMcpError } from "./errors";
import {
  callTool,
  describeServer,
  isExplorerAllowedTool,
  KyronMcpUnauthorizedError,
  listAllTools,
  readToolResultData,
  summarizeTool,
  summarizeToolResult,
  withKyronMcpClient,
} from "./mcp-client";
import {
  buildAuthorizationUrl,
  buildClientMetadataDocument,
  createPendingAuthorization,
  discoverKyronAuthorizationServer,
  exchangeAuthorizationCode,
  PENDING_AUTHORIZATION_MAX_AGE_MS,
  refreshAccessToken,
  revokeToken,
  tokenNeedsRefresh,
} from "./oauth";
import {
  deleteKyronConnection,
  readKyronConnection,
  saveKyronConnection,
} from "./token-store";
import type {
  KyronAuthorizationServer,
  KyronToolReader,
  KyronToolSession,
  PendingKyronAuthorization,
  StoredKyronConnection,
} from "./types";

export const PENDING_AUTHORIZATION_COOKIE = "kyron_oauth_pending";
export const PENDING_AUTHORIZATION_COOKIE_PATH = "/api/kyron-mcp/oauth";

const AUTHORIZATION_SERVER_CACHE_MS = 60 * 60 * 1000;
// The only Kyron tools that change content or start work which QA may call.
const QA_WRITE_TOOLS = new Set([
  "update_lesson_activity",
  "update_lesson",
  "update_lesson_section",
  "update_vocabulary_item",
  // Renders video for the lesson; used only after its script passes QA.
  "regenerate_all_lesson_videos",
]);

export function getKyronClientMetadataSetup(): KyronClientMetadataSetup {
  const env = getKyronMcpEnv();
  const clientId = env.KYRON_OAUTH_CLIENT_ID;

  return {
    clientId,
    redirectUri: env.KYRON_OAUTH_REDIRECT_URI,
    documentJson: JSON.stringify(
      buildClientMetadataDocument(
        clientId ?? "https://YOUR-HOSTED-FILE-URL",
        env.KYRON_OAUTH_REDIRECT_URI,
      ),
      null,
      2,
    ),
  };
}

export async function getKyronMcpConnectionStatus(): Promise<KyronMcpConnectionStatus> {
  const env = getKyronMcpEnv();
  const clientId = env.KYRON_OAUTH_CLIENT_ID;
  const redirectUri = env.KYRON_OAUTH_REDIRECT_URI;

  if (!clientId) {
    return { status: "not_configured", redirectUri };
  }

  const connection = await readKyronConnection();

  if (!connection || connection.clientId !== clientId) {
    return { status: "disconnected", clientId, redirectUri };
  }

  return {
    status: "connected",
    clientId,
    redirectUri,
    scope: connection.scope,
    connectedAt: connection.connectedAt,
    connectedBy: connection.connectedBy,
    accessTokenExpiresAt: connection.expiresAt,
    canRefresh: connection.refreshToken !== null,
  };
}

export async function beginKyronAuthorization(): Promise<{
  authorizationUrl: string;
  pendingCookieValue: string;
}> {
  const env = getKyronMcpEnv();
  const pending = createPendingAuthorization(
    requireClientId(),
    env.KYRON_OAUTH_REDIRECT_URI,
  );
  const server = await getAuthorizationServer();

  return {
    authorizationUrl: buildAuthorizationUrl(server, pending).toString(),
    pendingCookieValue: encryptJson(pending, getTokenEncryptionKey()),
  };
}

export async function completeKyronAuthorization({
  code,
  pendingCookieValue,
  state,
  user,
}: {
  code: string;
  pendingCookieValue: string | undefined;
  state: string;
  user: CurrentUser;
}): Promise<void> {
  const pending = readPendingAuthorization(pendingCookieValue);
  const env = getKyronMcpEnv();

  if (
    !pending ||
    pending.state !== state ||
    Date.now() - pending.createdAt > PENDING_AUTHORIZATION_MAX_AGE_MS ||
    pending.clientId !== requireClientId() ||
    pending.redirectUri !== env.KYRON_OAUTH_REDIRECT_URI
  ) {
    throw new KyronMcpError(
      "KYRON_MCP_NOT_CONNECTED",
      "The Kyron sign-in expired or did not match this browser. Try connecting again.",
    );
  }

  const tokens = await exchangeAuthorizationCode(
    await getAuthorizationServer(),
    pending,
    code,
  );

  await saveKyronConnection({
    ...tokens,
    clientId: pending.clientId,
    connectedAt: new Date().toISOString(),
    connectedBy: user.name,
  });
  await logEvent({
    category: "kyron_mcp",
    event: "kyron_mcp.connected",
    message: `${user.name} connected Kyron MCP (scope ${tokens.scope}).`,
    actorId: user.id,
    actorRole: user.role,
  });
}

export async function disconnectKyron(): Promise<void> {
  const connection = await readKyronConnection();

  if (connection) {
    try {
      await revokeToken(
        await getAuthorizationServer(),
        connection.clientId,
        connection.refreshToken ?? connection.accessToken,
      );
    } catch {
      // Local tokens are removed even if Kyron cannot be reached to revoke them.
    }
  }

  await deleteKyronConnection();
  await logEvent({
    category: "kyron_mcp",
    event: "kyron_mcp.disconnected",
    message: "Kyron MCP was disconnected and its local tokens deleted.",
  });
}

export async function getKyronCapabilityManifest(): Promise<KyronMcpCapabilityManifest> {
  const allowlist = getKyronMcpEnv().KYRON_MCP_READ_TOOLS;

  return withConnectedClient(async (client) => {
    const tools = await listAllTools(client);

    return {
      fetchedAt: new Date().toISOString(),
      ...describeServer(client),
      tools: tools.map((tool) => summarizeTool(tool, allowlist)),
    };
  });
}

export async function callKyronReadOnlyTool(
  name: string,
  args: Record<string, unknown>,
): Promise<KyronMcpToolCallResponse> {
  const allowlist = getKyronMcpEnv().KYRON_MCP_READ_TOOLS;

  return withConnectedClient(async (client) => {
    const tool = (await listAllTools(client)).find(
      (candidate) => candidate.name === name,
    );

    if (!tool) {
      throw new KyronMcpError(
        "KYRON_MCP_TOOL_NOT_ALLOWED",
        `Kyron does not offer a tool named "${name}".`,
      );
    }

    if (!isExplorerAllowedTool(tool, allowlist)) {
      throw new KyronMcpError(
        "KYRON_MCP_TOOL_NOT_ALLOWED",
        `"${name}" is not marked read-only, so the explorer will not run it.`,
      );
    }

    const startedAt = Date.now();
    const result = await callTool(client, name, args);
    const summary = summarizeToolResult(result);

    await logEvent({
      category: "kyron_mcp",
      event: "kyron_mcp.tool_call",
      level: summary.isError ? "warn" : "info",
      message: `Ran read-only tool ${name}${summary.isError ? " (tool reported an error)" : ""}.`,
      durationMs: Date.now() - startedAt,
      data: { tool: name, contentItems: summary.content.length, truncated: summary.truncated },
    });

    return {
      result: summary,
      durationMs: Date.now() - startedAt,
    };
  });
}

// Runs several read-only tool calls in one Kyron session, for reading a whole
// lesson. Tools Kyron does not mark read-only are refused.
export async function withKyronReader<T>(run: (read: KyronToolReader) => Promise<T>): Promise<T> {
  return withKyronSession(false, ({ read }) => run(read));
}

// Read-only tools plus the few update tools QA fixes use. Deleting,
// publishing, generating and settings changes are never allowed.
export async function withKyronWriter<T>(run: (session: KyronToolSession) => Promise<T>): Promise<T> {
  return withKyronSession(true, run);
}

// True when the saved Kyron sign-in includes the write permission.
export async function hasKyronWriteAccess(): Promise<boolean> {
  const clientId = getKyronMcpEnv().KYRON_OAUTH_CLIENT_ID;
  const connection = await readKyronConnection().catch(() => null);

  return Boolean(
    connection &&
      clientId &&
      connection.clientId === clientId &&
      connection.scope.split(/\s+/).includes("write"),
  );
}

async function withKyronSession<T>(
  allowWrites: boolean,
  run: (session: KyronToolSession) => Promise<T>,
): Promise<T> {
  const allowlist = getKyronMcpEnv().KYRON_MCP_READ_TOOLS;

  return withConnectedClient(async (client) => {
    const readable = new Set(
      (await listAllTools(client))
        .filter((tool) => isExplorerAllowedTool(tool, allowlist))
        .map((tool) => tool.name),
    );
    const call =
      (purpose: "qa.read" | "qa.write", allowed: (name: string) => boolean) =>
      async (name: string, args: Record<string, unknown>, detail: Record<string, unknown> = {}) => {
        if (!allowed(name)) {
          throw new KyronMcpError(
            "KYRON_MCP_TOOL_NOT_ALLOWED",
            `QA does not call the Kyron tool "${name}" (${purpose === "qa.read" ? "not read-only" : "not an allowed update"}).`,
          );
        }

        const startedAt = Date.now();
        const result = await callTool(client, name, args);

        await logEvent({
          category: "kyron_mcp",
          event: "kyron_mcp.tool_call",
          level: result.isError ? "warn" : "info",
          message: `QA ${purpose === "qa.read" ? "read" : "updated"} ${name}${result.isError ? " (tool reported an error)" : ""}.`,
          durationMs: Date.now() - startedAt,
          data: { tool: name, purpose, ...detail },
        });

        return readToolResultData(name, result);
      };

    return run({
      read: call("qa.read", (name) => readable.has(name)),
      write: call("qa.write", (name) => allowWrites && QA_WRITE_TOOLS.has(name)),
    });
  });
}

async function withConnectedClient<T>(
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const mcpUrl = getKyronMcpEnv().KYRON_MCP_URL;
  let connection = await getUsableConnection(false);

  try {
    return await withKyronMcpClient(mcpUrl, connection.accessToken, run);
  } catch (error) {
    if (!(error instanceof KyronMcpUnauthorizedError) || !connection.refreshToken) {
      throw error;
    }

    // The access token may have been revoked early; refresh once and retry.
    connection = await getUsableConnection(true);

    return withKyronMcpClient(mcpUrl, connection.accessToken, run);
  }
}

async function getUsableConnection(
  forceRefresh: boolean,
): Promise<StoredKyronConnection> {
  const connection = await readKyronConnection();

  if (!connection || connection.clientId !== requireClientId()) {
    throw new KyronMcpError(
      "KYRON_MCP_NOT_CONNECTED",
      "Kyron is not connected. Use Connect Kyron first.",
    );
  }

  if (!forceRefresh && !tokenNeedsRefresh(connection)) {
    return connection;
  }

  if (!connection.refreshToken) {
    throw new KyronMcpError(
      "KYRON_MCP_NOT_CONNECTED",
      "The Kyron sign-in expired. Connect Kyron again.",
    );
  }

  return refreshConnection(connection);
}

let refreshInFlight: Promise<StoredKyronConnection> | null = null;

function refreshConnection(
  connection: StoredKyronConnection,
): Promise<StoredKyronConnection> {
  // Concurrent requests share one refresh so a rotated token is not reused.
  refreshInFlight ??= (async () => {
    try {
      const tokens = await refreshAccessToken(
        await getAuthorizationServer(),
        connection.clientId,
        connection.refreshToken ?? "",
      );
      const refreshed = { ...connection, ...tokens };

      await saveKyronConnection(refreshed);

      return refreshed;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

let cachedAuthorizationServer:
  | { value: KyronAuthorizationServer; expiresAt: number }
  | undefined;

async function getAuthorizationServer(): Promise<KyronAuthorizationServer> {
  if (cachedAuthorizationServer && cachedAuthorizationServer.expiresAt > Date.now()) {
    return cachedAuthorizationServer.value;
  }

  const value = await discoverKyronAuthorizationServer(
    getKyronMcpEnv().KYRON_MCP_URL,
  );

  cachedAuthorizationServer = {
    value,
    expiresAt: Date.now() + AUTHORIZATION_SERVER_CACHE_MS,
  };

  return value;
}

function requireClientId(): string {
  const clientId = getKyronMcpEnv().KYRON_OAUTH_CLIENT_ID;

  if (!clientId) {
    throw new KyronMcpError(
      "KYRON_MCP_NOT_CONFIGURED",
      "KYRON_OAUTH_CLIENT_ID is not set. Host the client metadata file and add its URL to .env.local.",
    );
  }

  return clientId;
}

function readPendingAuthorization(
  cookieValue: string | undefined,
): PendingKyronAuthorization | null {
  if (!cookieValue) {
    return null;
  }

  const value = decryptJson(cookieValue, getTokenEncryptionKey());

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.state !== "string" ||
    typeof record.codeVerifier !== "string" ||
    typeof record.clientId !== "string" ||
    typeof record.redirectUri !== "string" ||
    typeof record.createdAt !== "number"
  ) {
    return null;
  }

  return {
    state: record.state,
    codeVerifier: record.codeVerifier,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    createdAt: record.createdAt,
  };
}
