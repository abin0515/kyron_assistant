import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSignInAttemptLimiter,
  resolveAccessCode,
} from "@/server/identity/access-codes";
import { isLocalhostHostname } from "@/server/identity/auth-config";
import {
  createSessionToken,
  SESSION_LIFETIME_SECONDS,
  verifySessionToken,
} from "@/server/identity/session-token";

const secret = "test-session-secret-with-at-least-32-characters";
const codes = { admin: "CPEAdmin", developer: "CPETest" };
const now = Date.parse("2026-10-30T12:00:00Z");

describe("access-code resolution", () => {
  it("maps each preset code to its role", () => {
    expect(resolveAccessCode("CPEAdmin", codes)).toBe("admin");
    expect(resolveAccessCode("CPETest", codes)).toBe("developer");
  });

  it("ignores surrounding whitespace but not case", () => {
    expect(resolveAccessCode("  CPEAdmin ", codes)).toBe("admin");
    expect(resolveAccessCode("cpeadmin", codes)).toBeNull();
    expect(resolveAccessCode("", codes)).toBeNull();
  });
});

describe("sign-in attempt limiter", () => {
  it("locks a client out after five failures within a minute", () => {
    const limiter = createSignInAttemptLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check("client", now).allowed).toBe(true);
      limiter.recordFailure("client", now + attempt);
    }

    expect(limiter.check("client", now + 10)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.check("other-client", now).allowed).toBe(true);
    expect(limiter.check("client", now + 61_000).allowed).toBe(true);
  });

  it("forgets failures older than the window and after success", () => {
    const limiter = createSignInAttemptLimiter();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      limiter.recordFailure("client", now);
    }

    limiter.recordFailure("client", now + 61_000);
    expect(limiter.check("client", now + 61_001).allowed).toBe(true);

    limiter.reset("client");
    expect(limiter.check("client", now + 61_002).allowed).toBe(true);
  });
});

describe("session tokens", () => {
  it("round-trips the role and subject", async () => {
    const token = await createSessionToken(
      { sub: "access-admin", role: "admin" },
      secret,
      now,
    );

    await expect(verifySessionToken(token, secret, now + 1000)).resolves.toEqual({
      sub: "access-admin",
      role: "admin",
      iat: now / 1000,
      exp: now / 1000 + SESSION_LIFETIME_SECONDS,
    });
  });

  it("rejects tampered, re-signed, and expired tokens", async () => {
    const token = await createSessionToken(
      { sub: "access-developer", role: "developer" },
      secret,
      now,
    );
    const [payload, signature] = token.split(".");
    const forgedPayload = btoa(
      JSON.stringify({ sub: "access-admin", role: "admin", iat: 0, exp: 9e9 }),
    ).replace(/=+$/, "");

    await expect(verifySessionToken(`${forgedPayload}.${signature}`, secret, now)).resolves.toBeNull();
    await expect(verifySessionToken(token, `${secret}-other`, now)).resolves.toBeNull();
    await expect(verifySessionToken(`${payload}.${signature}.extra`, secret, now)).resolves.toBeNull();
    await expect(
      verifySessionToken(token, secret, now + SESSION_LIFETIME_SECONDS * 1000),
    ).resolves.toBeNull();
  });
});

describe("localhost guard", () => {
  it("accepts only loopback hostnames", () => {
    expect(isLocalhostHostname("localhost")).toBe(true);
    expect(isLocalhostHostname("127.0.0.1")).toBe(true);
    expect(isLocalhostHostname("[::1]")).toBe(true);
    expect(isLocalhostHostname("kyron-launcher.vercel.app")).toBe(false);
    expect(isLocalhostHostname("localhost.example.com")).toBe(false);
  });
});
