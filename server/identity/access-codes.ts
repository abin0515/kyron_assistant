import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { AccessRole } from "@/types/api";

export type AccessIdentity = {
  id: string;
  name: string;
  email: string;
  role: AccessRole;
};

export type AccessCodes = Record<AccessRole, string>;

export const ACCESS_IDENTITIES = {
  admin: {
    id: "access-admin",
    name: "CPE Admin",
    email: "admin@cpe.localhost",
    role: "admin",
  },
  developer: {
    id: "access-developer",
    name: "CPE Test",
    email: "developer@cpe.localhost",
    role: "developer",
  },
} as const satisfies Record<AccessRole, AccessIdentity>;

export function resolveAccessCode(
  code: string,
  codes: AccessCodes,
): AccessRole | null {
  const submitted = digest(code.trim());
  let match: AccessRole | null = null;

  // Compare against every role so timing does not reveal which code matched.
  for (const role of ["admin", "developer"] as const) {
    if (timingSafeEqual(submitted, digest(codes[role])) && match === null) {
      match = role;
    }
  }

  return match;
}

export function createSignInAttemptLimiter({
  maxFailures = 5,
  windowMs = 60_000,
  lockoutMs = 60_000,
}: {
  maxFailures?: number;
  windowMs?: number;
  lockoutMs?: number;
} = {}) {
  const attempts = new Map<string, { failures: number[]; lockedUntil: number }>();

  return {
    check(key: string, now = Date.now()) {
      const lockedUntil = attempts.get(key)?.lockedUntil ?? 0;

      if (lockedUntil > now) {
        return {
          allowed: false as const,
          retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
        };
      }

      return { allowed: true as const };
    },
    recordFailure(key: string, now = Date.now()) {
      const entry = attempts.get(key) ?? { failures: [], lockedUntil: 0 };
      const failures = [
        ...entry.failures.filter((time) => now - time < windowMs),
        now,
      ];

      attempts.set(key, {
        failures: failures.length >= maxFailures ? [] : failures,
        lockedUntil: failures.length >= maxFailures ? now + lockoutMs : 0,
      });
    },
    reset(key: string) {
      attempts.delete(key);
    },
  };
}

export const signInAttemptLimiter = createSignInAttemptLimiter();

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
