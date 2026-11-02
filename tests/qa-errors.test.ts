import { AuthenticationError, RateLimitError } from "openai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { redactSecrets } from "@/server/logging/redact";
import { configurationProblem, describeError } from "@/server/qa/errors";

describe("QA error handling", () => {
  it("scrubs API keys, bearer tokens and signed URL parameters", () => {
    const text = redactSecrets(
      "401 Incorrect API key provided: sk-proj-********abcd. Header Bearer abc.def.ghi123 at https://x/u?X-Amz-Signature=deadbeef&ok=1",
    );

    expect(text).not.toContain("sk-proj");
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("deadbeef");
    expect(text).toContain("X-Amz-Signature=[redacted]");
    expect(text).toContain("ok=1");
  });

  it("blocks on a rejected OpenAI key instead of retrying", () => {
    const rejected = new AuthenticationError(401, undefined, "Incorrect API key provided: sk-proj-abcdef123456", new Headers());
    const throttled = new RateLimitError(429, undefined, "Rate limit reached", new Headers());

    expect(configurationProblem(rejected)).toContain("OPENAI_API_KEY");
    expect(configurationProblem(throttled)).toBeNull();
    expect(describeError(rejected)).not.toContain("sk-proj");
  });
});
