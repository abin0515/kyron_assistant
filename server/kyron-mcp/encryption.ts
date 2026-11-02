import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

// Encrypts a JSON value as "v1.<iv>.<tag>.<ciphertext>" using base64url parts.
export function encryptJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

// Returns null when the payload was tampered with or uses a different key.
export function decryptJson(payload: string, key: Buffer): unknown {
  const [version, iv, tag, ciphertext, extra] = payload.split(".");

  if (version !== VERSION || !iv || !tag || !ciphertext || extra !== undefined) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext) as unknown;
  } catch {
    return null;
  }
}
