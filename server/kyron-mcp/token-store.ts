import "server-only";

import { readFile, rm } from "node:fs/promises";

import { getDatabase } from "@/server/db/client";
import { getKyronMcpEnv, getTokenEncryptionKey } from "@/server/env";

import { decryptJson, encryptJson } from "./encryption";
import type { StoredKyronConnection } from "./types";

// The app-wide Kyron MCP sign-in, encrypted with TOKEN_ENCRYPTION_KEY and kept
// in Neon, so it survives restarts and works on Vercel, where functions cannot
// keep files. One row per Kyron client ID: local development (a client file
// hosted elsewhere) and the deployed site (its own client file) keep separate
// sign-ins even when they share a database. Staff never sign in; every Kyron
// call uses this one connection. A sign-in saved by the earlier file-based
// store is imported once.

export async function readKyronConnection(): Promise<StoredKyronConnection | null> {
  const clientId = getKyronMcpEnv().KYRON_OAUTH_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  const stored = await readStoredPayload(clientId);
  const connection = stored ? decrypt(stored) : await importLegacyFile(clientId);

  if (stored && !connection) {
    console.warn("The saved Kyron connection could not be read. Connect Kyron again.");
  }

  return connection;
}

export async function saveKyronConnection(connection: StoredKyronConnection): Promise<void> {
  await writeStoredPayload(connection.clientId, encryptJson(connection, getTokenEncryptionKey()));
}

// Removes this client's sign-in, and the old file too so it is never
// imported again.
export async function deleteKyronConnection(): Promise<void> {
  const clientId = getKyronMcpEnv().KYRON_OAUTH_CLIENT_ID;

  if (clientId) {
    await getDatabase()`DELETE FROM kyron_mcp_connections WHERE id = ${clientId}`;
  }

  await rm(getKyronMcpEnv().KYRON_TOKEN_FILE, { force: true });
}

async function readStoredPayload(clientId: string): Promise<string | null> {
  const rows = (await getDatabase()`
    SELECT encrypted_connection FROM kyron_mcp_connections WHERE id = ${clientId}
  `) as Array<{ encrypted_connection: string }>;

  return rows[0]?.encrypted_connection ?? null;
}

async function writeStoredPayload(clientId: string, payload: string): Promise<void> {
  await getDatabase()`
    INSERT INTO kyron_mcp_connections (id, encrypted_connection)
    VALUES (${clientId}, ${payload})
    ON CONFLICT (id) DO UPDATE SET
      encrypted_connection = EXCLUDED.encrypted_connection,
      record_updated_at = NOW()
  `;
}

// Copies a sign-in from the earlier file store (.data/kyron-oauth.json) into
// Neon the first time it is needed, when it belongs to the current client.
async function importLegacyFile(clientId: string): Promise<StoredKyronConnection | null> {
  let payload: string;

  try {
    payload = (await readFile(getKyronMcpEnv().KYRON_TOKEN_FILE, "utf8")).trim();
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }

  const connection = payload ? decrypt(payload) : null;

  if (!connection || connection.clientId !== clientId) {
    return null;
  }

  await writeStoredPayload(clientId, payload);
  console.info("Imported the saved Kyron connection into the database.");

  return connection;
}

function decrypt(payload: string): StoredKyronConnection | null {
  return parseStoredConnection(decryptJson(payload, getTokenEncryptionKey()));
}

function parseStoredConnection(value: unknown): StoredKyronConnection | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.accessToken !== "string" ||
    (record.refreshToken !== null && typeof record.refreshToken !== "string") ||
    typeof record.tokenType !== "string" ||
    typeof record.scope !== "string" ||
    (record.expiresAt !== null && typeof record.expiresAt !== "string") ||
    typeof record.clientId !== "string" ||
    typeof record.connectedAt !== "string" ||
    typeof record.connectedBy !== "string"
  ) {
    return null;
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    tokenType: record.tokenType,
    scope: record.scope,
    expiresAt: record.expiresAt,
    clientId: record.clientId,
    connectedAt: record.connectedAt,
    connectedBy: record.connectedBy,
  };
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
