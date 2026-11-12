import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mediaUploadAvailable } from "@/server/qa/media-upload";

afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});

describe("uploading a video for the narration check", () => {
  it("is available locally, even with settings pulled from Vercel", () => {
    expect(mediaUploadAvailable()).toBe(true);

    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "development";

    expect(mediaUploadAvailable()).toBe(true);
  });

  it("is turned off on a deployment", () => {
    process.env.VERCEL = "1";

    for (const environment of ["production", "preview"]) {
      process.env.VERCEL_ENV = environment;

      expect(mediaUploadAvailable()).toBe(false);
    }
  });
});
