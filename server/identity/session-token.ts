// Uses Web Crypto so proxy.ts and route handlers can share it.

import type { AccessRole } from "@/types/api";

export const SESSION_COOKIE_NAME = "cpe_session";
export const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

export type SessionClaims = {
  sub: string;
  role: AccessRole;
  iat: number;
  exp: number;
};

export async function createSessionToken(
  { sub, role }: Pick<SessionClaims, "sub" | "role">,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const claims = {
    sub,
    role,
    iat: issuedAt,
    exp: issuedAt + SESSION_LIFETIME_SECONDS,
  } satisfies SessionClaims;
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    new TextEncoder().encode(payload),
  );

  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra !== undefined) {
    return null;
  }

  const signatureBytes = base64UrlDecode(signature);

  if (!signatureBytes) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(secret),
    signatureBytes,
    new TextEncoder().encode(payload),
  );

  if (!valid) {
    return null;
  }

  const claims = parseClaims(base64UrlDecode(payload));

  if (!claims || claims.exp <= Math.floor(now / 1000)) {
    return null;
  }

  return claims;
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
    secure,
  };
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function parseClaims(bytes: Uint8Array | null): SessionClaims | null {
  if (!bytes) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (
      typeof value === "object" &&
      value !== null &&
      "sub" in value &&
      "role" in value &&
      "iat" in value &&
      "exp" in value &&
      typeof value.sub === "string" &&
      (value.role === "admin" || value.role === "developer") &&
      typeof value.iat === "number" &&
      typeof value.exp === "number"
    ) {
      return {
        sub: value.sub,
        role: value.role,
        iat: value.iat,
        exp: value.exp,
      };
    }
  } catch {
    // Malformed payloads are treated the same as invalid signatures.
  }

  return null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    return null;
  }

  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}
