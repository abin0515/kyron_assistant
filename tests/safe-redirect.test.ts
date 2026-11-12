import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/safe-redirect";

const SITE = "https://course-studio.test";

describe("where sign-in sends you next", () => {
  it("keeps paths on this site exactly as given", () => {
    for (const path of ["/drafts", "/qa/runs/x?y=1", "/drafts?q=100%", "/drafts/new#top"]) {
      expect(safeRedirectPath(path)).toBe(path);
    }

    expect(safeRedirectPath(["/sources", "/evil"])).toBe("/sources");
  });

  it("sends anything that could leave the site to the drafts list", () => {
    const hostile = [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/..//evil.example",
      "/.//evil.example",
      "/%2e%2e//evil.example",
      "https://evil.example",
      "evil.example",
      "",
      undefined,
    ];

    for (const path of hostile) {
      expect(safeRedirectPath(path)).toBe("/drafts");
    }
  });

  it("never returns a path that resolves to another origin", () => {
    const inputs = ["/drafts", "/%09/evil.example", "/a/../../evil", "/drafts?next=//evil.example", "/..//evil.example"];

    for (const path of inputs) {
      expect(new URL(safeRedirectPath(path), SITE).origin).toBe(SITE);
    }
  });
});
