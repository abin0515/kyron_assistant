import { describe, expect, it } from "vitest";

import { estimateCostUsd } from "@/server/logging/cost";
import { redactSecrets, scrubData } from "@/server/logging/redact";

const luna = {
  id: "price-1",
  inputUsdPerMillion: 0.1,
  cachedInputUsdPerMillion: 0.01,
  outputUsdPerMillion: 0.5,
};

describe("estimated model cost", () => {
  it("prices cached input separately and bills reasoning as output", () => {
    // 1M input of which 200K cached, 400K output (reasoning already included).
    expect(
      estimateCostUsd({ inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 400_000 }, luna),
    ).toBeCloseTo(0.08 + 0.002 + 0.2, 10);
  });

  it("returns null instead of $0 when the model has no price", () => {
    expect(estimateCostUsd({ inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 }, null)).toBeNull();
  });

  it("never counts more cached tokens than input tokens", () => {
    expect(estimateCostUsd({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 }, luna)).toBeCloseTo(
      (100 * 0.01) / 1_000_000,
      12,
    );
  });
});

describe("log data scrubbing", () => {
  it("drops sensitive keys and scrubs secrets inside strings", () => {
    const scrubbed = scrubData({
      apiKey: "sk-live-123456789",
      accessCode: "CPEAdmin",
      nested: { authorization: "Bearer abcdefghijk", note: "url https://x.test/u?token=abc&ok=1" },
      databaseUrl: "postgresql://user:pass@host/db",
      long: "x".repeat(3_000),
    });

    expect(JSON.stringify(scrubbed)).not.toMatch(/sk-live|CPEAdmin|abcdefghijk|user:pass/);
    expect(scrubbed).toMatchObject({
      nested: { note: "url https://x.test/u?token=[redacted]&ok=1" },
      databaseUrl: "[redacted]",
    });
    expect(String(scrubbed.long)).toContain("(3000 chars)");
  });

  it("redacts connection strings in messages", () => {
    expect(redactSecrets('failed for "postgresql://a:b@c/d?sslmode=require"')).toBe('failed for "[redacted]"');
  });
});
