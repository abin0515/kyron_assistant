import type { SourceFileContentType } from "@/server/source-files/types";
import type { SourceFileUsagePurpose } from "@/types/api";

export type WorkspaceSourceFile = {
  id: string;
  originalName: string;
  contentType: SourceFileContentType;
  byteSize: number;
  purpose: SourceFileUsagePurpose;
  workspaceCount: number;
  linkedAt: string;
  recordCreatedAt: string;
  recordUpdatedAt: string;
};
