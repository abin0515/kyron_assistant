import { getSourceFileType } from "@/features/source-library/file-type";
import type { SourceFileType } from "@/features/source-library/types";

export type FolderFileCandidate = {
  file: File;
  relativePath: string;
};

export type IgnoredFolderFile = {
  path: string;
  reason: "Hidden or system file" | "Unsupported file type";
};

export type FolderSelection = {
  files: FolderFileCandidate[];
  folderName: string;
  ignoredFiles: IgnoredFolderFile[];
};

export function selectFolderFiles(
  files: File[],
  allowedTypes: SourceFileType[],
): FolderSelection {
  const selection: FolderSelection = {
    files: [],
    folderName: readFolderName(files),
    ignoredFiles: [],
  };

  for (const file of files) {
    const relativePath = readRelativePath(file);

    if (isHiddenOrSystemPath(relativePath)) {
      selection.ignoredFiles.push({
        path: relativePath,
        reason: "Hidden or system file",
      });
      continue;
    }

    const fileType = getSourceFileType(file.name);

    if (!fileType || !allowedTypes.includes(fileType)) {
      selection.ignoredFiles.push({
        path: relativePath,
        reason: "Unsupported file type",
      });
      continue;
    }

    selection.files.push({ file, relativePath });
  }

  return selection;
}

function readFolderName(files: File[]): string {
  const firstPath = files.find((file) => file.webkitRelativePath)
    ?.webkitRelativePath;

  return firstPath?.split("/")[0] || "Selected folder";
}

function readRelativePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

function isHiddenOrSystemPath(path: string): boolean {
  return path.split("/").some((segment) => {
    const normalizedSegment = segment.toLocaleLowerCase();

    return normalizedSegment.startsWith(".") || normalizedSegment === "__macosx";
  });
}
