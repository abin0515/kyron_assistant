import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptJson, encryptJson } from "@/server/kyron-mcp/encryption";
import { KyronMcpError } from "@/server/kyron-mcp/errors";
import {
  buildAuthorizationUrl,
  codeChallengeFor,
  createPendingAuthorization,
  discoverKyronAuthorizationServer,
  exchangeAuthorizationCode,
  parseTokenResponse,
  tokenNeedsRefresh,
} from "@/server/kyron-mcp/oauth";

const now = Date.parse("2026-10-30T12:00:00Z");
const server = {
  issuer: "https://www.kyronlearning.com",
  authorizationEndpoint: "https://www.kyronlearning.com/oauth/authorize",
  tokenEndpoint: "https://www.kyronlearning.com/oauth/token",
  revocationEndpoint: "https://www.kyronlearning.com/oauth/revoke",
};
const clientId = "https://gist.githubusercontent.com/cpe/abc/raw/kyron-client.json";
const redirectUri = "http://localhost:3000/api/kyron-mcp/oauth/callback";

describe("Kyron OAuth authorization request", () => {
  it("derives the S256 challenge from RFC 7636's example verifier", () => {
    expect(codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("builds a PKCE request for read and write scope without a resource parameter", () => {
    const pending = createPendingAuthorization(clientId, redirectUri, now);
    const url = buildAuthorizationUrl(server, pending);

    expect(url.origin + url.pathname).toBe(server.authorizationEndpoint);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read write",
      state: pending.state,
      code_challenge: codeChallengeFor(pending.codeVerifier),
      code_challenge_method: "S256",
    });
    expect(pending.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("Kyron OAuth discovery", () => {
  it("follows the protected resource metadata to the authorization server", async () => {
    const fetchImplementation = vi.fn(async (url: string | URL | Request) =>
      Response.json(
        String(url).includes("oauth-protected-resource")
          ? { authorization_servers: ["https://www.kyronlearning.com"] }
          : {
              issuer: "https://www.kyronlearning.com",
              authorization_endpoint: server.authorizationEndpoint,
              token_endpoint: server.tokenEndpoint,
              revocation_endpoint: server.revocationEndpoint,
              code_challenge_methods_supported: ["S256"],
            },
      ),
    );

    await expect(
      discoverKyronAuthorizationServer(
        "https://www.kyronlearning.com/mcp",
        fetchImplementation as typeof fetch,
      ),
    ).resolves.toEqual(server);
    expect(fetchImplementation.mock.calls.map(([url]) => String(url))).toEqual([
      "https://www.kyronlearning.com/.well-known/oauth-protected-resource/mcp",
      "https://www.kyronlearning.com/.well-known/oauth-authorization-server",
    ]);
  });

  it("rejects an authorization server that does not support S256", async () => {
    const fetchImplementation = vi.fn(async (url: string | URL | Request) =>
      Response.json(
        String(url).includes("oauth-protected-resource")
          ? { authorization_servers: ["https://www.kyronlearning.com"] }
          : {
              issuer: "https://www.kyronlearning.com",
              authorization_endpoint: server.authorizationEndpoint,
              token_endpoint: server.tokenEndpoint,
              code_challenge_methods_supported: ["plain"],
            },
      ),
    );

    await expect(
      discoverKyronAuthorizationServer(
        "https://www.kyronlearning.com/mcp",
        fetchImplementation as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "KYRON_INVALID_RESPONSE" });
  });
});

describe("Kyron OAuth token handling", () => {
  it("exchanges the code with the PKCE verifier as a public client", async () => {
    const pending = createPendingAuthorization(clientId, redirectUri, now);
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        access_token: "access-1",
        token_type: "Bearer",
        expires_in: 7200,
        refresh_token: "refresh-1",
        scope: "read",
      }),
    );

    const tokens = await exchangeAuthorizationCode(
      server,
      pending,
      "code-1",
      fetchImplementation as typeof fetch,
      now,
    );
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];

    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pending.codeVerifier,
    });
    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      tokenType: "Bearer",
      scope: "read",
      expiresAt: "2026-10-30T14:00:00.000Z",
    });
  });

  it("asks for a reconnect when Kyron reports invalid_grant", async () => {
    const pending = createPendingAuthorization(clientId, redirectUri, now);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );

    const exchange = exchangeAuthorizationCode(
      server,
      pending,
      "expired-code",
      fetchImplementation as typeof fetch,
    );

    await expect(exchange).rejects.toBeInstanceOf(KyronMcpError);
    await expect(exchange).rejects.toMatchObject({ code: "KYRON_MCP_NOT_CONNECTED" });
  });

  it("keeps the previous refresh token when Kyron does not rotate it", () => {
    expect(
      parseTokenResponse({ access_token: "access-2", token_type: "bearer" }, now, "refresh-1"),
    ).toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-1",
      tokenType: "Bearer",
      scope: "read write",
      expiresAt: null,
    });
    expect(parseTokenResponse({ access_token: "x", token_type: "mac" }, now, null)).toBeNull();
    expect(parseTokenResponse({ token_type: "Bearer" }, now, null)).toBeNull();
  });

  it("refreshes a minute before expiry and never for tokens without expiry", () => {
    expect(tokenNeedsRefresh({ expiresAt: "2026-10-30T12:00:30Z" }, now)).toBe(true);
    expect(tokenNeedsRefresh({ expiresAt: "2026-10-30T12:05:00Z" }, now)).toBe(false);
    expect(tokenNeedsRefresh({ expiresAt: null }, now)).toBe(false);
  });
});

describe("token encryption", () => {
  it("round-trips JSON and rejects tampering or another key", () => {
    const key = randomBytes(32);
    const payload = encryptJson({ accessToken: "secret" }, key);
    const [version, iv, tag, data] = payload.split(".");
    const flipped = `${data.slice(0, -1)}${data.endsWith("A") ? "B" : "A"}`;

    expect(decryptJson(payload, key)).toEqual({ accessToken: "secret" });
    expect(payload).not.toContain("secret");
    expect(decryptJson([version, iv, tag, flipped].join("."), key)).toBeNull();
    expect(decryptJson(payload, randomBytes(32))).toBeNull();
    expect(decryptJson("not-a-payload", key)).toBeNull();
  });
});
