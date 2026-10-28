import { beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), {
    query: vi.fn(),
  });

  return { database: sql };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => database,
}));

import { getBatchById } from "@/server/batches/repository";

const batchId = "41eba217-8a41-48e5-8eb5-a860c1c3310d";
const userId = "user_123";

describe("batch repository workspace status", () => {
  beforeEach(() => {
    database.mockReset();
    database.query.mockReset();
    database.mockResolvedValue([
      {
        id: batchId,
        name: "Test batch",
        record_created_at: "2026-09-19T14:29:00.064Z",
        record_updated_at: "2026-09-19T14:30:44.970Z",
      },
    ]);
  });

  it("shows a failed Kyron submission as needing attention", async () => {
    database.query.mockResolvedValue([
      batchWorkspaceRow({
        workspace_status: "error",
        workspace_status_message:
          "The draft attachment could not be transferred to Kyron.",
        setup_status: "reviewed",
        setup_status_message: "AI suggestion generated and ready to submit.",
      }),
    ]);

    const batch = await getBatchById(batchId, userId);

    expect(batch?.workspaces[0]).toMatchObject({
      status: "kyron_error",
      statusMessage:
        "The draft attachment could not be transferred to Kyron.",
    });
  });

  it("keeps a reviewed workspace ready before submission", async () => {
    database.query.mockResolvedValue([
      batchWorkspaceRow({
        workspace_status: "editing",
        workspace_status_message: "",
        setup_status: "reviewed",
        setup_status_message: "AI suggestion generated and ready to submit.",
      }),
    ]);

    const batch = await getBatchById(batchId, userId);

    expect(batch?.workspaces[0]).toMatchObject({
      status: "ready",
      statusMessage: "AI suggestion generated and ready to submit.",
    });
  });
});

function batchWorkspaceRow(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    batch_id: batchId,
    id: "7123961d-42ed-4cd7-8175-f42c416365ca",
    workspace_status: "editing",
    workspace_status_message: "",
    setup_status: "reviewed",
    setup_status_message: "AI suggestion generated and ready to submit.",
    name: "Risk Management",
    description: "Learn practical risk management.",
    learning_objective: "Assess project risks.",
    audience: "Project managers",
    asset_type: "lesson",
    duration_seconds: 1800,
    kyron_draft_id: null,
    kyron_asset_folder_id: null,
    kyron_asset_folder_path: [],
    record_updated_at: "2026-09-19T14:30:44.970Z",
    source_file_id: "f88a2048-1479-40eb-b71a-f2a47abc7359",
    source_file_name: "risk-management.pdf",
    source_file_size: 1200,
    source_file_type: "pdf",
    has_attachment: true,
    include_in_calibration: false,
    kyron_status: null,
    kyron_status_message: null,
    kyron_availability: null,
    ...overrides,
  };
}
