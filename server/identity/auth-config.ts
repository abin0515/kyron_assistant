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
