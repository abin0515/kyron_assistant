import { describe, expect, it } from "vitest";

import {
  kyronAttachmentOf,
  linkPromptFiles,
  validatePromptFile,
  type PromptFile,
} from "@/features/drafts/workspaces/prompt-files";
import type { SourceFileListItem, UpdateWorkspaceSourceFilesRequest } from "@/types/api";

const MB = 1_048_576;

describe("files added to the new-draft prompt box", () => {
  it("accepts PDF, PowerPoint and Word files and explains any refusal", () => {
    const none = new Set<string>();

    expect(validatePromptFile({ name: "Lecture 1.pdf", size: 3 * MB }, none)).toBeNull();
    expect(validatePromptFile({ name: "Slides.pptx", size: 120 * MB }, none)).toBeNull();
    expect(validatePromptFile({ name: "Notes.docx", size: 2 * MB }, none)).toBeNull();
    expect(validatePromptFile({ name: "notes.txt", size: 10 }, none)).toMatch(/Only PDF, PowerPoint/);
    expect(validatePromptFile({ name: "empty.pdf", size: 0 }, none)).toBe("This file is empty.");
    expect(validatePromptFile({ name: "huge.pdf", size: 251 * MB }, none)).toMatch(/250 MB/);
    // Kyron cannot take Word files, so one the AI cannot read is refused.
    expect(validatePromptFile({ name: "big.docx", size: 60 * MB }, none)).toBe("Word files can be at most 50 MB.");
    expect(validatePromptFile({ name: " Lecture 1.PDF ", size: MB }, new Set(["lecture 1.pdf"]))).toMatch(/already added/);
  });

  it("sends the first ready PDF or PowerPoint to Kyron", () => {
    const files = [
      promptFile("notes", "docx"),
      promptFile("uploading", "pdf", { status: "uploading", sourceFile: null }),
      promptFile("slides", "pptx"),
      promptFile("handout", "pdf"),
    ];

    expect(kyronAttachmentOf(files)?.key).toBe("slides");
    expect(kyronAttachmentOf([promptFile("notes", "docx")])).toBeNull();
  });

  it("links readable files for the AI and the attachment for Kyron, replacing an earlier attempt's links", async () => {
    const calls: UpdateWorkspaceSourceFilesRequest[] = [];
    const put = async (_workspaceId: string, input: UpdateWorkspaceSourceFilesRequest) => {
      calls.push(input);
    };

    // A 120 MB deck is too large for the AI but still goes to Kyron.
    await linkPromptFiles("ws-1", [promptFile("deck", "pptx", { aiReadable: false }), promptFile("notes", "docx")], put);

    expect(calls).toEqual([
      { purpose: "ai_input", sourceFileIds: ["notes-id"] },
      { purpose: "kyron_attachment", sourceFileIds: ["deck-id"] },
    ]);

    // Tried again with every file removed: both lists are cleared.
    calls.length = 0;
    await linkPromptFiles("ws-1", [], put);

    expect(calls).toEqual([
      { purpose: "ai_input", sourceFileIds: [] },
      { purpose: "kyron_attachment", sourceFileIds: [] },
    ]);
  });
});

function promptFile(key: string, type: SourceFileListItem["type"], overrides: Partial<PromptFile> = {}): PromptFile {
  return {
    key,
    name: `${key}.${type}`,
    size: MB,
    status: "ready",
    progress: 100,
    sourceFile: {
      id: `${key}-id`,
      name: `${key}.${type}`,
      size: MB,
      type,
      workspaceCount: 0,
      uploadedAt: "2026-11-12T00:00:00.000Z",
      updatedAt: "2026-11-12T00:00:00.000Z",
    },
    reused: false,
    aiReadable: true,
    error: null,
    retryable: false,
    ...overrides,
  };
}
