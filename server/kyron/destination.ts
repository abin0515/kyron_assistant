import type {
  KyronDestination,
  KyronFolderPathItem,
} from "@/types/api";

const MAX_FOLDER_DEPTH = 50;
const MAX_FOLDER_NAME_LENGTH = 255;

export function parseKyronDestination(
  value: unknown,
): { destination: KyronDestination } | { errors: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: ["Kyron destination must be an object."] };
  }

  const input = value as Record<string, unknown>;
  const folderId = input.folderId;
  const path = input.path;

  if (!(folderId === null || isPositiveInteger(folderId))) {
    return { errors: ["Kyron folder ID must be a positive integer or null."] };
  }

  if (!Array.isArray(path) || path.length > MAX_FOLDER_DEPTH) {
    return { errors: ["Kyron folder path is invalid."] };
  }

  const parsedPath: KyronFolderPathItem[] = [];

  for (const item of path) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { errors: ["Kyron folder path is invalid."] };
    }

    const location = item as Record<string, unknown>;
    const name = typeof location.name === "string" ? location.name.trim() : "";

    if (
      !isPositiveInteger(location.id) ||
      !name ||
      name.length > MAX_FOLDER_NAME_LENGTH
    ) {
      return { errors: ["Kyron folder path is invalid."] };
    }

    parsedPath.push({ id: location.id, name });
  }

  if (folderId === null && parsedPath.length > 0) {
    return { errors: ["The top-level Library cannot have a folder path."] };
  }

  if (
    folderId !== null &&
    parsedPath.at(-1)?.id !== folderId
  ) {
    return { errors: ["Kyron folder path does not match the selected folder."] };
  }

  return {
    destination: {
      folderId,
      path: parsedPath,
    },
  };
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}
