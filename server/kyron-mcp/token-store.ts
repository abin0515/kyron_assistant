import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getKyronMcpEnv, getTokenEncryptionKey } from "@/server/env";

import { decryptJson, encryptJson } from "./encryption";
import type { StoredKyronConnection } from "./types";

// Development storage: one encrypted file for the app-wide Kyron connection.
// It moves into Neon together with the QA tables.

export async function readKyronConnection(): Promise<StoredKyronConnection | null> {
  let payload: string;

  try {
    payload = await readFile(tokenFilePath(), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }

  const connection = parseStoredConnection(
    decryptJson(payload.trim(), getTokenEncryptionKey()),
  );

  if (!connection) {
    console.warn(
      "The saved Kyron connection could not be read. Connect Kyron again.",
    );
  }

  return connection;
}

export async function saveKyronConnection(
  connection: StoredKyronConnection,
): Promise<void> {
  const filePath = tokenFilePath();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    temporaryPath,
    encryptJson(connection, getTokenEncryptionKey()),
    { encoding: "utf8", mode: 0o600 },
  );
  await rename(temporaryPath, filePath);
}

export async function deleteKyronConnection(): Promise<void> {
  await rm(tokenFilePath(), { force: true });
}

function tokenFilePath(): string {
  return getKyronMcpEnv().KYRON_TOKEN_FILE;
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
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
