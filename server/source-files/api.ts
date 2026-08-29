import "server-only";

import type {
  SourceFile,
  SourceFileContentType,
} from "@/server/source-files/types";
import type { SourceFileListItem, SourceFileType } from "@/types/api";

type SourceFileListSource = Pick<
  SourceFile,
  | "id"
  | "originalName"
  | "contentType"
  | "byteSize"
  | "recordCreatedAt"
  | "recordUpdatedAt"
>;

const SOURCE_FILE_TYPE_BY_CONTENT_TYPE: Record<
  SourceFileContentType,
  SourceFileType
> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

const SOURCE_FILE_CONTENT_TYPE_BY_TYPE: Record<
  SourceFileType,
  SourceFileContentType
> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function toSourceFileListItem(
  sourceFile: SourceFileListSource,
  workspaceCount: number,
): SourceFileListItem {
  return {
    id: sourceFile.id,
    name: sourceFile.originalName,
    size: sourceFile.byteSize,
    type: SOURCE_FILE_TYPE_BY_CONTENT_TYPE[sourceFile.contentType],
    workspaceCount,
    uploadedAt: sourceFile.recordCreatedAt,
    updatedAt: sourceFile.recordUpdatedAt,
  };
}

export function toSourceFileContentType(
  type: SourceFileType,
): SourceFileContentType {
  return SOURCE_FILE_CONTENT_TYPE_BY_TYPE[type];
}
