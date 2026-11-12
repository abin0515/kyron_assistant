// Read by proxy.ts as well as server code, so this module avoids "server-only".

export type AuthMode = "access-code" | "clerk";

const MIN_SESSION_SECRET_LENGTH = 32;
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE?.trim() === "access-code"
    ? "access-code"
    : "clerk";
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();

  if (
    !secret ||
    secret.startsWith("replace_with") ||
    secret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    throw new Error(
      `SESSION_SECRET must be configured with at least ${MIN_SESSION_SECRET_LENGTH} characters.`,
    );
  }

  return secret;
}

export function isLocalhostHostname(hostname: string): boolean {
  return LOCALHOST_HOSTNAMES.has(hostname.toLowerCase());
}

// Outside localhost (the deployed site) access codes must be long enough that
// they cannot be guessed, since the per-server limit on wrong codes resets
// whenever Vercel starts a new instance.
export const MIN_REMOTE_ACCESS_CODE_LENGTH = 24;

export const SHORT_ACCESS_CODES_MESSAGE = `Access codes must be at least ${MIN_REMOTE_ACCESS_CODE_LENGTH} characters outside localhost. Set longer ACCESS_CODE_ADMIN and ACCESS_CODE_DEVELOPER values.`;

export function accessCodesAllowedOn(
  hostname: string,
  codes: { admin?: string; developer?: string } = {
    admin: process.env.ACCESS_CODE_ADMIN,
    developer: process.env.ACCESS_CODE_DEVELOPER,
  },
): boolean {
  if (isLocalhostHostname(hostname)) {
    return true;
  }

  return [codes.admin, codes.developer].every(
    (code) => (code?.trim().length ?? 0) >= MIN_REMOTE_ACCESS_CODE_LENGTH,
  );
}
