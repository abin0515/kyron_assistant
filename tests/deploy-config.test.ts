import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { accessCodesAllowedOn, MIN_REMOTE_ACCESS_CODE_LENGTH } from "@/server/identity/auth-config";
import { getAppBaseUrl, getKyronMcpEnv } from "@/server/env";

const ENV_NAMES = ["APP_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "KYRON_OAUTH_CLIENT_ID"] as const;
const long = "x".repeat(MIN_REMOTE_ACCESS_CODE_LENGTH);

afterEach(() => {
  ENV_NAMES.forEach((name) => delete process.env[name]);
});

describe("access codes on the deployed site", () => {
  it("lets short local codes work only on localhost", () => {
    const codes = { admin: "CPEAdmin", developer: "CPETest" };

    expect(accessCodesAllowedOn("localhost", codes)).toBe(true);
    expect(accessCodesAllowedOn("127.0.0.1", codes)).toBe(true);
    expect(accessCodesAllowedOn("course-studio.vercel.app", codes)).toBe(false);
  });

  it("allows any host once both codes are long enough", () => {
    expect(accessCodesAllowedOn("course-studio.vercel.app", { admin: long, developer: long })).toBe(true);
    expect(accessCodesAllowedOn("course-studio.vercel.app", { admin: long, developer: "short" })).toBe(false);
    expect(accessCodesAllowedOn("course-studio.vercel.app", { admin: long })).toBe(false);
  });
});

describe("app address and Kyron client file", () => {
  it("uses Vercel's production address when APP_BASE_URL is not set", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "course-studio.vercel.app";

    expect(getAppBaseUrl()).toBe("https://course-studio.vercel.app");

    process.env.APP_BASE_URL = "https://courses.stevens.edu/";

    expect(getAppBaseUrl()).toBe("https://courses.stevens.edu");
  });

  it("serves its own client file on an https deployment", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "course-studio.vercel.app";

    expect(getKyronMcpEnv()).toMatchObject({
      KYRON_OAUTH_CLIENT_ID: "https://course-studio.vercel.app/oauth/kyron-client.json",
      KYRON_OAUTH_CLIENT_SELF_HOSTED: true,
      KYRON_OAUTH_REDIRECT_URI: "https://course-studio.vercel.app/api/kyron-mcp/oauth/callback",
    });
  });

  it("keeps a client file hosted elsewhere when KYRON_OAUTH_CLIENT_ID is set", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "course-studio.vercel.app";
    process.env.KYRON_OAUTH_CLIENT_ID = "https://gist.githack.com/user/gist/raw/kyron-client.json";

    expect(getKyronMcpEnv()).toMatchObject({
      KYRON_OAUTH_CLIENT_ID: "https://gist.githack.com/user/gist/raw/kyron-client.json",
      KYRON_OAUTH_CLIENT_SELF_HOSTED: false,
    });
  });

  it("has no client ID on plain localhost without a hosted file", () => {
    expect(getKyronMcpEnv()).toMatchObject({ KYRON_OAUTH_CLIENT_ID: null, KYRON_OAUTH_CLIENT_SELF_HOSTED: false });
  });

  it("serves the client file as JSON whose client_id is its own address", async () => {
    process.env.APP_BASE_URL = "https://course-studio.vercel.app";

    const { GET } = await import("@/app/oauth/kyron-client.json/route");
    const response = GET();

    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      client_id: "https://course-studio.vercel.app/oauth/kyron-client.json",
      client_name: "CPE Course Studio",
      redirect_uris: ["https://course-studio.vercel.app/api/kyron-mcp/oauth/callback"],
      token_endpoint_auth_method: "none",
      scope: "read write",
    });
  });
});
