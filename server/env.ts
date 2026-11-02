import "server-only";

import path from "node:path";

import type { AccessCodes } from "@/server/identity/access-codes";

type ServerEnv = {
  KYRON_API_KEY: string;
  KYRON_API_BASE_URL: string;
};

type OpenAIEnv = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
};

type KyronMcpEnv = {
  KYRON_MCP_URL: string;
  KYRON_OAUTH_CLIENT_ID: string | null;
  KYRON_OAUTH_REDIRECT_URI: string;
  KYRON_TOKEN_FILE: string;
  KYRON_MCP_READ_TOOLS: string[];
};

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

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey || apiKey === "replace_with_your_openai_api_key") {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  cachedOpenAIEnv = {
    OPENAI_API_KEY: apiKey,
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
  const appBaseUrl = (
    process.env.APP_BASE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "");

  return {
    KYRON_MCP_URL:
      process.env.KYRON_MCP_URL?.trim() ||
      "https://www.kyronlearning.com/mcp",
    KYRON_OAUTH_CLIENT_ID: readClientIdUrl(),
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
  const value = process.env[name]?.trim();

  if (!value || value.startsWith("replace_with")) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
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
