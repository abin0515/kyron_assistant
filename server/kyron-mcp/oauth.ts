import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { KyronMcpError } from "./errors";
import type {
  KyronAuthorizationServer,
  KyronOAuthTokens,
  PendingKyronAuthorization,
} from "./types";

// QA fixes write lesson content; the explorer itself still runs read-only tools only.
export const KYRON_MCP_SCOPE = "read write";
export const PENDING_AUTHORIZATION_MAX_AGE_MS = 10 * 60 * 1000;

const OAUTH_TIMEOUT_MS = 15_000;
const REFRESH_SKEW_MS = 60_000;
const MAX_ERROR_DETAIL_LENGTH = 300;

type FetchImplementation = typeof fetch;

export async function discoverKyronAuthorizationServer(
  mcpUrl: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<KyronAuthorizationServer> {
  const resourceMetadata = await fetchJson(
    protectedResourceMetadataUrl(new URL(mcpUrl)),
    fetchImplementation,
  );
  const issuer = firstAuthorizationServer(resourceMetadata);
  const serverMetadata = await fetchJson(
    authorizationServerMetadataUrl(issuer),
    fetchImplementation,
  );

  return parseAuthorizationServer(serverMetadata, issuer);
}

export function createPendingAuthorization(
  clientId: string,
  redirectUri: string,
  now = Date.now(),
): PendingKyronAuthorization {
  return {
    state: randomBytes(24).toString("base64url"),
    codeVerifier: randomBytes(48).toString("base64url"),
    clientId,
    redirectUri,
    createdAt: now,
  };
}

export function buildAuthorizationUrl(
  server: KyronAuthorizationServer,
  pending: PendingKyronAuthorization,
): URL {
  const url = new URL(server.authorizationEndpoint);

  // Kyron does not support resource indicators, so no "resource" parameter.
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: pending.clientId,
    redirect_uri: pending.redirectUri,
    scope: KYRON_MCP_SCOPE,
    state: pending.state,
    code_challenge: codeChallengeFor(pending.codeVerifier),
    code_challenge_method: "S256",
  }).toString();

  return url;
}

export async function exchangeAuthorizationCode(
  server: KyronAuthorizationServer,
  pending: PendingKyronAuthorization,
  code: string,
  fetchImplementation: FetchImplementation = fetch,
  now = Date.now(),
): Promise<KyronOAuthTokens> {
  const body = await postTokenRequest(
    server.tokenEndpoint,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.codeVerifier,
    },
    fetchImplementation,
  );

  return requireTokens(parseTokenResponse(body, now, null));
}

export async function refreshAccessToken(
  server: KyronAuthorizationServer,
  clientId: string,
  refreshToken: string,
  fetchImplementation: FetchImplementation = fetch,
  now = Date.now(),
): Promise<KyronOAuthTokens> {
  const body = await postTokenRequest(
    server.tokenEndpoint,
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    },
    fetchImplementation,
  );

  return requireTokens(parseTokenResponse(body, now, refreshToken));
}

export async function revokeToken(
  server: KyronAuthorizationServer,
  clientId: string,
  token: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<boolean> {
  if (!server.revocationEndpoint) {
    return false;
  }

  try {
    const response = await fetchImplementation(server.revocationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, client_id: clientId }),
      cache: "no-store",
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function buildClientMetadataDocument(
  clientId: string,
  redirectUri: string,
) {
  return {
    client_id: clientId,
    client_name: "CPE Course Studio (local development)",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "read write",
  };
}

export function parseTokenResponse(
  value: unknown,
  now: number,
  previousRefreshToken: string | null,
): KyronOAuthTokens | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;

  if (
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof body.token_type !== "string" ||
    body.token_type.toLowerCase() !== "bearer"
  ) {
    return null;
  }

  const expiresIn =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : null;

  return {
    accessToken: body.access_token,
    // Kyron may rotate refresh tokens; keep the previous one if it does not.
    refreshToken:
      typeof body.refresh_token === "string" && body.refresh_token
        ? body.refresh_token
        : previousRefreshToken,
    tokenType: "Bearer",
    scope:
      typeof body.scope === "string" && body.scope ? body.scope : KYRON_MCP_SCOPE,
    expiresAt:
      expiresIn === null ? null : new Date(now + expiresIn * 1000).toISOString(),
  };
}

export function tokenNeedsRefresh(
  tokens: Pick<KyronOAuthTokens, "expiresAt">,
  now = Date.now(),
): boolean {
  return (
    tokens.expiresAt !== null &&
    Date.parse(tokens.expiresAt) - now <= REFRESH_SKEW_MS
  );
}

export function codeChallengeFor(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

function protectedResourceMetadataUrl(resource: URL): string {
  const path = resource.pathname === "/" ? "" : resource.pathname;

  return `${resource.origin}/.well-known/oauth-protected-resource${path}`;
}

function authorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

  return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

function firstAuthorizationServer(value: unknown): string {
  const servers =
    typeof value === "object" && value !== null && "authorization_servers" in value
      ? value.authorization_servers
      : null;
  const issuer = Array.isArray(servers) ? servers[0] : null;

  if (typeof issuer !== "string" || !isHttpsUrl(issuer)) {
    throw invalidMetadataError();
  }

  return issuer;
}

function parseAuthorizationServer(
  value: unknown,
  expectedIssuer: string,
): KyronAuthorizationServer {
  if (typeof value !== "object" || value === null) {
    throw invalidMetadataError();
  }

  const metadata = value as Record<string, unknown>;
  const challengeMethods = metadata.code_challenge_methods_supported;

  if (
    typeof metadata.issuer !== "string" ||
    trimSlash(metadata.issuer) !== trimSlash(expectedIssuer) ||
    typeof metadata.authorization_endpoint !== "string" ||
    !isHttpsUrl(metadata.authorization_endpoint) ||
    typeof metadata.token_endpoint !== "string" ||
    !isHttpsUrl(metadata.token_endpoint) ||
    (Array.isArray(challengeMethods) && !challengeMethods.includes("S256"))
  ) {
    throw invalidMetadataError();
  }

  return {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    revocationEndpoint:
      typeof metadata.revocation_endpoint === "string" &&
      isHttpsUrl(metadata.revocation_endpoint)
        ? metadata.revocation_endpoint
        : null,
  };
}

async function fetchJson(
  url: string,
  fetchImplementation: FetchImplementation,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetchImplementation(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
  } catch {
    throw unreachableError();
  }

  if (!response.ok) {
    throw invalidMetadataError();
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw invalidMetadataError();
  }
}

async function postTokenRequest(
  tokenEndpoint: string,
  parameters: Record<string, string>,
  fetchImplementation: FetchImplementation,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetchImplementation(tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(parameters),
      cache: "no-store",
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
  } catch {
    throw unreachableError();
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw tokenErrorFromResponse(body);
  }

  return body;
}

function tokenErrorFromResponse(value: unknown): KyronMcpError {
  const body =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const error = typeof body.error === "string" ? body.error : "unknown_error";
  const description =
    typeof body.error_description === "string"
      ? `: ${body.error_description.slice(0, MAX_ERROR_DETAIL_LENGTH)}`
      : "";

  if (error === "invalid_grant") {
    return new KyronMcpError(
      "KYRON_MCP_NOT_CONNECTED",
      "The Kyron sign-in expired or was revoked. Connect Kyron again.",
    );
  }

  return new KyronMcpError(
    "KYRON_MCP_NOT_CONNECTED",
    `Kyron rejected the sign-in request (${error}${description}).`,
  );
}

function requireTokens(tokens: KyronOAuthTokens | null): KyronOAuthTokens {
  if (!tokens) {
    throw new KyronMcpError(
      "KYRON_INVALID_RESPONSE",
      "Kyron returned an unexpected sign-in response.",
    );
  }

  return tokens;
}

function unreachableError(): KyronMcpError {
  return new KyronMcpError(
    "KYRON_MCP_UNAVAILABLE",
    "Kyron's sign-in service could not be reached.",
    true,
  );
}

function invalidMetadataError(): KyronMcpError {
  return new KyronMcpError(
    "KYRON_INVALID_RESPONSE",
    "Kyron's sign-in metadata could not be read.",
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
