import { describe, expect, it, vi } from "vitest";

import { createKyronClient, KyronClientError } from "@/server/kyron/client-core";

const folder = {
  id: 42,
  name: "EM 612",
  parent_id: null,
  created_at: "2026-09-18T12:00:00Z",
  updated_at: "2026-09-18T12:00:00Z",
};

describe("Kyron folder client", () => {
  it("lists one page of direct child folders", async () => {
    const fetchImplementation = mockFetch({
      asset_folders: [folder],
      meta: {
        current_page: 2,
        next_page: 3,
        prev_page: 1,
        total_pages: 3,
        total_count: 51,
      },
    });
    const client = createClient(fetchImplementation);

    const result = await client.listAssetFolders({
      parent_id: 10,
      page: 2,
      per_page: 25,
    });

    expect(result.asset_folders).toEqual([folder]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://kyron.example/api/v2/asset_folders?parent_id=10&page=2&per_page=25",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
        }),
      }),
    );
  });

  it("creates a folder inside the selected parent", async () => {
    const fetchImplementation = mockFetch(
      { asset_folder: { ...folder, parent_id: 10 } },
      201,
    );
    const client = createClient(fetchImplementation);

    const result = await client.createAssetFolder({
      name: "EM 612",
      parent_id: 10,
    });

    expect(result.parent_id).toBe(10);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://kyron.example/api/v2/asset_folders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "EM 612", parent_id: 10 }),
      }),
    );
  });

  it("rejects a folder response that does not match the API contract", async () => {
    const client = createClient(
      mockFetch({
        asset_folders: [{ ...folder, id: "42" }],
        meta: {
          current_page: 1,
          next_page: null,
          prev_page: null,
          total_pages: 1,
          total_count: 1,
        },
      }),
    );

    await expect(client.listAssetFolders()).rejects.toMatchObject({
      code: "KYRON_INVALID_RESPONSE",
    } satisfies Partial<KyronClientError>);
  });

  it("maps Kyron duplicate-name responses to a conflict", async () => {
    const client = createClient(mockFetch({}, 422));

    await expect(
      client.createAssetFolder({ name: "Existing folder" }),
    ).rejects.toMatchObject({
      code: "KYRON_CONFLICT",
      retryable: false,
      upstreamStatus: 422,
    } satisfies Partial<KyronClientError>);
  });

  it("sends the selected folder when creating a lesson collection", async () => {
    const fetchImplementation = mockFetch(
      {
        lesson_collection: {
          id: 14408,
          slug: "project-planning",
          name: "Project Planning",
          description: "Build a practical project plan.",
          published_at: null,
          created_at: "2026-09-18T12:00:00Z",
          updated_at: "2026-09-18T12:00:00Z",
          preview_url: "https://kyron.example/preview",
          editor_url: "https://kyron.example/editor",
          status: "started",
          status_message: "Generating",
        },
      },
      201,
    );
    const client = createClient(fetchImplementation);

    await client.createLessonCollection({
      name: "Project Planning",
      description: "Build a practical project plan.",
      learning_objective: "Create a project plan.",
      audience: "New project managers",
      duration: 900,
      lesson_type: "lesson",
      asset_folder_id: 6121,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://kyron.example/api/v2/lesson_collections",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"asset_folder_id":6121'),
      }),
    );
  });
});

function createClient(fetchImplementation: typeof fetch) {
  return createKyronClient({
    apiKey: "secret-key",
    baseUrl: "https://kyron.example/api/v2",
    fetchImplementation,
  });
}

function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}
