import type {
  SourceFileListItem,
  SourceFileUsagePurpose,
  SourceFileUsageState,
} from "@/types/api";

export type SourceFileType = "pdf" | "pptx" | "docx";

export type SourceFileUsage = {
  purpose: SourceFileUsagePurpose;
  state: SourceFileUsageState;
  workspaceId: string;
  workspaceTitle: string;
};

export type SourceFileListRecord = {
  id: string;
  name: string;
  size: number;
  type: SourceFileType;
  uploadedAt: string;
  workspaceCount: number;
};

export type SourceFileRecord = SourceFileListRecord & {
  usages: SourceFileUsage[];
};

export type SourceFileTypeFilter = "all" | SourceFileType;

export type SourceFileSort = "recent" | "name" | "usage";

export type SourceFileUploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

export type SourceFileUploadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: SourceFileUploadProgress) => void;
};

export type SourceFileUploadAction = (
  file: File,
  options?: SourceFileUploadOptions,
) => Promise<SourceFileListItem>;
