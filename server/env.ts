import "server-only";

import path from "node:path";

import type { AccessCodes } from "@/server/identity/access-codes";

type ServerEnv = {
  KYRON_API_KEY: string;
  KYRON_API_BASE_URL: string;
};

// Model calls go through Vercel AI Gateway when AI_GATEWAY_API_KEY is set,
// otherwise straight to OpenAI. Model names stay the same either way.
type OpenAIEnv = {
  AI_GATEWAY_API_KEY: string | null;
  OPENAI_API_KEY: string | null;
  OPENAI_MODEL: string;
};

type KyronMcpEnv = {
  KYRON_MCP_URL: string;
  KYRON_OAUTH_CLIENT_ID: string | null;
  // True when the client ID is this app's own /oauth/kyron-client.json.
  KYRON_OAUTH_CLIENT_SELF_HOSTED: boolean;
  KYRON_OAUTH_REDIRECT_URI: string;
  KYRON_TOKEN_FILE: string;
  KYRON_MCP_READ_TOOLS: string[];
};

export const KYRON_CLIENT_FILE_PATH = "/oauth/kyron-client.json";

let cachedServerEnv: ServerEnv | undefined;
let cachedOpenAIEnv: OpenAIEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const apiKey = process.env.KYRON_API_KEY?.trim();

  if (!apiKey || apiKey === "replace_with_your_kyron_api_key") {
    throw new Error("KYRON_API_KEY is not configured.");
  }

  cachedServerEnv = {
    KYRON_API_KEY: apiKey,
    KYRON_API_BASE_URL: (
      process.env.KYRON_API_BASE_URL ??
      "https://app.kyronlearning.com/api/v2"
    ).replace(/\/+$/, ""),
  };

  return cachedServerEnv;
}

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (
    !databaseUrl ||
    databaseUrl === "replace_with_your_neon_database_url"
  ) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return databaseUrl;
}

export function getOpenAIEnv(): OpenAIEnv {
  if (cachedOpenAIEnv) {
    return cachedOpenAIEnv;
  }

  const gatewayKey = readOptionalSecret("AI_GATEWAY_API_KEY");
  const openaiKey = readOptionalSecret("OPENAI_API_KEY");

  if (!gatewayKey && !openaiKey) {
    throw new Error("Set AI_GATEWAY_API_KEY (Vercel AI Gateway) or OPENAI_API_KEY.");
  }

  cachedOpenAIEnv = {
    AI_GATEWAY_API_KEY: gatewayKey,
    OPENAI_API_KEY: openaiKey,
    OPENAI_MODEL:
      process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
  };

  return cachedOpenAIEnv;
}

export function getAccessCodes(): AccessCodes {
  const admin = readRequiredSecret("ACCESS_CODE_ADMIN");
  const developer = readRequiredSecret("ACCESS_CODE_DEVELOPER");

  if (admin === developer) {
    throw new Error(
      "ACCESS_CODE_ADMIN and ACCESS_CODE_DEVELOPER must be different.",
    );
  }

  return { admin, developer };
}

export function getKyronMcpEnv(): KyronMcpEnv {
  const appBaseUrl = getAppBaseUrl();
  const configuredClientId = readClientIdUrl();
  // On an https deployment the app hosts its own client file, so only
  // local development needs KYRON_OAUTH_CLIENT_ID (a file hosted elsewhere).
  const selfHostedClientId = appBaseUrl.startsWith("https://")
    ? selfHostedKyronClientId()
    : null;

  return {
    KYRON_MCP_URL:
      process.env.KYRON_MCP_URL?.trim() ||
      "https://www.kyronlearning.com/mcp",
    KYRON_OAUTH_CLIENT_ID: configuredClientId ?? selfHostedClientId,
    KYRON_OAUTH_CLIENT_SELF_HOSTED: !configuredClientId && selfHostedClientId !== null,
    KYRON_OAUTH_REDIRECT_URI: `${appBaseUrl}/api/kyron-mcp/oauth/callback`,
    KYRON_TOKEN_FILE:
      process.env.KYRON_TOKEN_FILE?.trim() ||
      path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "kyron-oauth.json"),
    KYRON_MCP_READ_TOOLS: (process.env.KYRON_MCP_READ_TOOLS ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

// The address people open the app at: APP_BASE_URL, else Vercel's production
// domain, else localhost.
export function getAppBaseUrl(): string {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const value =
    process.env.APP_BASE_URL?.trim() ||
    (vercelDomain ? `https://${vercelDomain}` : "http://localhost:3000");

  return value.replace(/\/+$/, "");
}

// The client ID Kyron uses when the app serves its own client file.
export function selfHostedKyronClientId(): string {
  return `${getAppBaseUrl()}${KYRON_CLIENT_FILE_PATH}`;
}

export function getTokenEncryptionKey(): Buffer {
  const key = Buffer.from(
    readRequiredSecret("TOKEN_ENCRYPTION_KEY"),
    "base64",
  );

  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }

  return key;
}

function readRequiredSecret(name: string): string {
  const value = readOptionalSecret(name);

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

// Empty and placeholder ("replace_with…") values count as unset.
function readOptionalSecret(name: string): string | null {
  const value = process.env[name]?.trim();

  return value && !value.startsWith("replace_with") ? value : null;
}

function readClientIdUrl(): string | null {
  const value = process.env.KYRON_OAUTH_CLIENT_ID?.trim();

  if (!value || value.startsWith("replace_with")) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.pathname === "/" || url.hash) {
      throw new Error("invalid");
    }

    // Kyron compares the client ID with the hosted document as an exact string.
    return value;
  } catch {
    throw new Error(
      "KYRON_OAUTH_CLIENT_ID must be the https URL of the client metadata document.",
    );
  }
}
