import { getSourceFileType } from "@/features/source-library/file-type";
import {
  MAX_AI_SOURCE_SIZE_BYTES,
  MAX_UPLOAD_SIZE_BYTES,
  type SourceFileListItem,
  type UpdateWorkspaceSourceFilesRequest,
} from "@/types/api";

export const PROMPT_FILE_ACCEPT = ".pdf,.pptx,.docx";
export const MAX_PROMPT_FILES = 10;

// A file added to the new-draft prompt box.
export type PromptFile = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  // 0–100 while uploading.
  progress: number;
  sourceFile: SourceFileListItem | null;
  // The Source Library already had this file (same name and size); that
  // copy is used.
  reused: boolean;
  // Small enough for the AI to read; a larger PDF or PowerPoint only goes to
  // Kyron as the course material.
  aiReadable: boolean;
  error: string | null;
  // Validation errors cannot be retried; upload errors can.
  retryable: boolean;
};

// Why a picked file cannot be added, or null. takenNames holds the
// normalized names already in the box.
export function validatePromptFile(file: Pick<File, "name" | "size">, takenNames: Set<string>): string | null {
  // The upload trims the name, so the type is read from the trimmed one.
  const type = getSourceFileType(file.name.trim());

  if (!type) {
    return "Only PDF, PowerPoint (.pptx) and Word (.docx) files can be added.";
  }

  if (file.size === 0) {
    return "This file is empty.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "This file is larger than the 250 MB limit.";
  }

  // Kyron takes only PDF and PowerPoint, so a Word file must be readable.
  if (type === "docx" && file.size > MAX_AI_SOURCE_SIZE_BYTES) {
    return "Word files can be at most 50 MB.";
  }

  if (takenNames.has(normalizeFileName(file.name))) {
    return "A file with this name is already added.";
  }

  return null;
}

// The file Kyron receives as the course material: the first ready PDF or
// PowerPoint, in the order added.
export function kyronAttachmentOf(files: PromptFile[]): PromptFile | null {
  return (
    files.find(
      (file) => file.status === "ready" && (file.sourceFile?.type === "pdf" || file.sourceFile?.type === "pptx"),
    ) ?? null
  );
}

// Links the prompt's files to the new draft: the readable ones feed the AI,
// and the Kyron attachment is set (any accepted size). Both lists are written
// every time, so trying again replaces what an earlier attempt linked.
export async function linkPromptFiles(
  workspaceId: string,
  readyFiles: PromptFile[],
  put: (workspaceId: string, input: UpdateWorkspaceSourceFilesRequest) => Promise<unknown>,
): Promise<void> {
  const aiInputIds = readyFiles.filter((file) => file.aiReadable).flatMap((file) => file.sourceFile?.id ?? []);
  const attachment = kyronAttachmentOf(readyFiles)?.sourceFile;

  await put(workspaceId, { purpose: "ai_input", sourceFileIds: aiInputIds });
  await put(workspaceId, { purpose: "kyron_attachment", sourceFileIds: attachment ? [attachment.id] : [] });
}

export function normalizeFileName(name: string): string {
  return name.trim().toLocaleLowerCase();
}
