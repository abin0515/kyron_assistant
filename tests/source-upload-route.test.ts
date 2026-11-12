import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleUploadPresigned: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ issueSignedToken: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ handleUploadPresigned: mocks.handleUploadPresigned }));
vi.mock("@/server/source-files/service", () => {
  class NamedError extends Error {}

  return {
    cancelCurrentUserSourceFileUpload: vi.fn(),
    prepareCurrentUserSourceFileUpload: vi.fn(),
    SourceFileNameConflictError: NamedError,
    SourceFileUploadInProgressError: NamedError,
    SourceFileUploadValidationError: NamedError,
  };
});
vi.mock("@/server/http/api-response", async () => {
  const { NextResponse } = await import("next/server");
  const json = (status: number) => (message: string) =>
    NextResponse.json({ error: { code: "VALIDATION_ERROR", message, retryable: false } }, { status });

  return {
    conflictErrorResponse: json(409),
    internalErrorResponse: () => NextResponse.json({ error: { message: "internal" } }, { status: 500 }),
    noStoreHeaders: {},
    requestErrorResponse: (message: string, status = 400) => json(status)(message),
  };
});

import { GET, POST } from "@/app/api/source-files/upload/route";
import { NextRequest } from "next/server";

const BLOB_NAMES = ["BLOB_WEBHOOK_PUBLIC_KEY", "BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"] as const;

afterEach(() => {
  BLOB_NAMES.forEach((name) => delete process.env[name]);
  mocks.handleUploadPresigned.mockReset();
});

function tokenRequest() {
  return new NextRequest("http://localhost:3000/api/source-files/upload", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ type: "blob.generate-presigned-url", payload: { pathname: "x", clientPayload: null, multipart: false } }),
  });
}

describe("the source-file upload route", () => {
  it("says uploads are ready once the Blob store is connected", async () => {
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "key";
    process.env.BLOB_STORE_ID = "store";

    expect((await GET()).status).toBe(204);

    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_READ_WRITE_TOKEN = "token";

    expect((await GET()).status).toBe(204);
  });

  it("explains a missing Blob setup instead of failing every upload with a server error", async () => {
    process.env.BLOB_STORE_ID = "store";

    const check = await GET();

    expect(check.status).toBe(503);
    await expect(check.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_FAILED", retryable: false, message: expect.stringContaining("connect the Vercel Blob store") },
    });

    const upload = await POST(tokenRequest());

    expect(upload.status).toBe(503);
    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
  });

  it("reports the same setup message when the store cannot be reached", async () => {
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "key";
    process.env.BLOB_STORE_ID = "store";
    mocks.handleUploadPresigned.mockRejectedValue(new Error("Vercel Blob: No blob credentials found. Pass a `token` option."));

    const upload = await POST(tokenRequest());

    expect(upload.status).toBe(503);
    await expect(upload.json()).resolves.toMatchObject({ error: { message: expect.stringContaining("aren't set up") } });
  });

  it("takes no upload-completed callbacks", async () => {
    const callback = new NextRequest("http://localhost:3000/api/source-files/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.upload-completed", payload: {} }),
    });

    expect((await POST(callback)).status).toBe(400);
  });
});
