import type { SourceFileType } from "@/features/source-library/types";

export function getSourceFileType(fileName: string): SourceFileType | null {
  const extension = fileName.split(".").pop()?.toLowerCase();

  return extension === "pdf" || extension === "pptx" || extension === "docx"
    ? extension
    : null;
}
