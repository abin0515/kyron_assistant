import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isExplorerAllowedTool,
  summarizeToolResult,
} from "@/server/kyron-mcp/mcp-client";

describe("Kyron MCP explorer policy", () => {
  it("runs only tools marked read-only or explicitly allowlisted", () => {
    expect(
      isExplorerAllowedTool({ name: "list_lessons", annotations: { readOnlyHint: true } }, []),
    ).toBe(true);
    expect(isExplorerAllowedTool({ name: "update_activity" }, [])).toBe(false);
    expect(
      isExplorerAllowedTool(
        { name: "update_activity", annotations: { readOnlyHint: false } },
        [],
      ),
    ).toBe(false);
    expect(isExplorerAllowedTool({ name: "get_lesson" }, ["get_lesson"])).toBe(true);
  });
});

describe("Kyron MCP tool results", () => {
  it("summarizes media by size instead of returning raw bytes", () => {
    const summary = summarizeToolResult({
      content: [
        { type: "text", text: "{\"lessons\":[]}" },
        { type: "image", data: "AAAA", mimeType: "image/png" },
        {
          type: "resource_link",
          uri: "https://cdn.example/video.mp4",
          name: "Lesson video",
          mimeType: "video/mp4",
        },
      ],
    });

    expect(summary).toEqual({
      isError: false,
      content: [
        { type: "text", text: "{\"lessons\":[]}" },
        { type: "image", mimeType: "image/png", byteLength: 3 },
        {
          type: "resource_link",
          uri: "https://cdn.example/video.mp4",
          name: "Lesson video",
          mimeType: "video/mp4",
        },
      ],
      structuredContent: null,
      truncated: false,
    });
  });

  it("truncates very long text and reports it", () => {
    const summary = summarizeToolResult({
      content: [{ type: "text", text: "x".repeat(250_000) }],
      isError: true,
    });
    const [item] = summary.content;

    expect(summary.isError).toBe(true);
    expect(summary.truncated).toBe(true);
    expect(item.type === "text" ? item.text.length : 0).toBe(200_000);
  });
});
