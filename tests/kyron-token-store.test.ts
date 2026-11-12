import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  file: null as string | null,
  removed: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({
  readFile: async () => {
    if (mocks.file === null) {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }

    return mocks.file;
  },
  rm: async (path: string) => {
    mocks.removed.push(path);
    mocks.file = null;
  },
}));
// A stand-in for kyron_mcp_connections, keyed by client ID.
vi.mock("@/server/db/client", () => ({
  getDatabase: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    const id = String(values[0]);

    if (text.includes("SELECT")) {
      return mocks.rows.has(id) ? [{ encrypted_connection: mocks.rows.get(id) }] : [];
    }

    if (text.includes("INSERT")) {
      mocks.rows.set(id, String(values[1]));
    }

    if (text.includes("DELETE")) {
      mocks.rows.delete(id);
    }

    return [];
  },
}));

import { encryptJson } from "@/server/kyron-mcp/encryption";
import { deleteKyronConnection, readKyronConnection, saveKyronConnection } from "@/server/kyron-mcp/token-store";

const key = randomBytes(32);
const LOCAL_CLIENT = "https://gist.example.test/raw/kyron-client.json";
const SITE_CLIENT = "https://course-studio.vercel.app/oauth/kyron-client.json";
const connection = {
  accessToken: "access",
  refreshToken: "refresh",
  tokenType: "Bearer",
  scope: "read write",
  expiresAt: "2026-11-09T20:00:00.000Z",
  clientId: LOCAL_CLIENT,
  connectedAt: "2026-11-02T18:12:00.000Z",
  connectedBy: "CPE Admin",
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = key.toString("base64");
  process.env.KYRON_TOKEN_FILE = "C:/legacy/kyron-oauth.json";
  process.env.KYRON_OAUTH_CLIENT_ID = LOCAL_CLIENT;
  mocks.rows = new Map();
  mocks.file = null;
  mocks.removed = [];
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.KYRON_TOKEN_FILE;
  delete process.env.KYRON_OAUTH_CLIENT_ID;
});

describe("Kyron sign-in stored in Neon", () => {
  it("saves and reads the encrypted sign-in under its client ID", async () => {
    await saveKyronConnection(connection);

    expect([...mocks.rows.keys()]).toEqual([LOCAL_CLIENT]);
    expect(mocks.rows.get(LOCAL_CLIENT)).toMatch(/^v1\./);
    expect(mocks.rows.get(LOCAL_CLIENT)).not.toContain("access");
    await expect(readKyronConnection()).resolves.toEqual(connection);
  });

  it("keeps local and deployed sign-ins apart in one database", async () => {
    await saveKyronConnection(connection);
    await saveKyronConnection({ ...connection, clientId: SITE_CLIENT, accessToken: "site" });

    await expect(readKyronConnection()).resolves.toMatchObject({ clientId: LOCAL_CLIENT, accessToken: "access" });

    process.env.KYRON_OAUTH_CLIENT_ID = SITE_CLIENT;

    await expect(readKyronConnection()).resolves.toMatchObject({ clientId: SITE_CLIENT, accessToken: "site" });
  });

  it("imports a sign-in from the old file once, only for its own client", async () => {
    mocks.file = `${encryptJson(connection, key)}\n`;

    process.env.KYRON_OAUTH_CLIENT_ID = SITE_CLIENT;
    await expect(readKyronConnection()).resolves.toBeNull();
    expect(mocks.rows.size).toBe(0);

    process.env.KYRON_OAUTH_CLIENT_ID = LOCAL_CLIENT;
    await expect(readKyronConnection()).resolves.toEqual(connection);
    expect(mocks.rows.get(LOCAL_CLIENT)).toBe(mocks.file.trim());

    mocks.file = null;

    await expect(readKyronConnection()).resolves.toEqual(connection);
  });

  it("returns null when nothing is stored, or no client ID is configured", async () => {
    await expect(readKyronConnection()).resolves.toBeNull();

    delete process.env.KYRON_OAUTH_CLIENT_ID;
    await saveKyronConnection(connection);

    await expect(readKyronConnection()).resolves.toBeNull();
  });

  it("disconnecting removes this client's row and the old file", async () => {
    await saveKyronConnection(connection);
    await saveKyronConnection({ ...connection, clientId: SITE_CLIENT });
    mocks.file = "old";

    await deleteKyronConnection();

    expect([...mocks.rows.keys()]).toEqual([SITE_CLIENT]);
    expect(mocks.removed).toEqual(["C:/legacy/kyron-oauth.json"]);
    await expect(readKyronConnection()).resolves.toBeNull();
  });
});
