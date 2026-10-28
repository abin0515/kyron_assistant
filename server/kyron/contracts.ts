export type KyronLessonType = "lesson" | "practice" | "scenario";
export type KyronDuration = 480 | 900 | 1800 | 3600;
export type KyronLessonCollectionStatus = "started" | "error" | "done";

export type KyronCreateFileRequest = {
  blob: {
    filename: string;
    byte_size: number;
    checksum: string;
    content_type: string;
  };
};

export type KyronFileUpload = {
  signed_id: string;
  direct_upload: {
    url: string;
    headers: Record<string, string>;
  };
};

export type KyronCreateLessonCollectionRequest = {
  name: string;
  description: string;
  learning_objective: string;
  audience: string;
  duration: KyronDuration;
  lesson_type: KyronLessonType;
  asset_folder_id?: number;
  alignment_content_signed_id?: string;
};

export type KyronListAssetFoldersQuery = {
  parent_id?: number;
  page?: number;
  per_page?: number;
};

export type KyronCreateAssetFolderRequest = {
  name: string;
  parent_id?: number;
};

export type KyronAssetFolder = {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
};

export type KyronPaginationMeta = {
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  total_pages: number;
  total_count: number;
};

export type KyronAssetFolderList = {
  asset_folders: KyronAssetFolder[];
  meta: KyronPaginationMeta;
};

export type KyronOrganization = {
  id: number;
  name: string;
};

export type KyronLessonCollection = {
  id: number;
  slug: string;
  name: string;
  description: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  preview_url: string;
  editor_url: string;
  status: KyronLessonCollectionStatus;
  status_message: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function parseFileUpload(
  value: unknown,
): KyronFileUpload | null {
  if (
    !isObject(value) ||
    typeof value.signed_id !== "string" ||
    !value.signed_id ||
    !isObject(value.direct_upload) ||
    !isHttpUrl(value.direct_upload.url) ||
    !isObject(value.direct_upload.headers)
  ) {
    return null;
  }

  const headers: Record<string, string> = {};

  for (const [name, headerValue] of Object.entries(
    value.direct_upload.headers,
  )) {
    if (typeof headerValue !== "string") {
      return null;
    }

    headers[name] = headerValue;
  }

  return {
    signed_id: value.signed_id,
    direct_upload: {
      url: value.direct_upload.url,
      headers,
    },
  };
}

export function parseOrganization(
  value: unknown,
): KyronOrganization | null {
  if (!isObject(value) || !isObject(value.organization)) {
    return null;
  }

  const { id, name } = value.organization;

  if (
    !Number.isSafeInteger(id) ||
    typeof id !== "number" ||
    id <= 0 ||
    typeof name !== "string"
  ) {
    return null;
  }

  return { id, name };
}

export function parseLessonCollection(
  value: unknown,
): KyronLessonCollection | null {
  if (!isObject(value) || !isObject(value.lesson_collection)) {
    return null;
  }

  const collection = value.lesson_collection;
  const status = collection.status;

  if (
    typeof collection.id !== "number" ||
    !Number.isSafeInteger(collection.id) ||
    collection.id <= 0 ||
    typeof collection.slug !== "string" ||
    typeof collection.name !== "string" ||
    typeof collection.description !== "string" ||
    !(
      collection.published_at === null ||
      typeof collection.published_at === "string"
    ) ||
    typeof collection.created_at !== "string" ||
    typeof collection.updated_at !== "string" ||
    !isHttpUrl(collection.preview_url) ||
    !isHttpUrl(collection.editor_url) ||
    !["started", "error", "done"].includes(String(status)) ||
    typeof collection.status_message !== "string"
  ) {
    return null;
  }

  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    published_at: collection.published_at,
    created_at: collection.created_at,
    updated_at: collection.updated_at,
    preview_url: collection.preview_url,
    editor_url: collection.editor_url,
    status: status as KyronLessonCollectionStatus,
    status_message: collection.status_message,
  };
}

export function parseAssetFolderList(
  value: unknown,
): KyronAssetFolderList | null {
  if (
    !isObject(value) ||
    !Array.isArray(value.asset_folders) ||
    !isObject(value.meta)
  ) {
    return null;
  }

  const folders = value.asset_folders.map(parseAssetFolderValue);
  const meta = parsePaginationMeta(value.meta);

  if (folders.some((folder) => folder === null) || !meta) {
    return null;
  }

  return {
    asset_folders: folders as KyronAssetFolder[],
    meta,
  };
}

export function parseAssetFolder(
  value: unknown,
): KyronAssetFolder | null {
  if (!isObject(value) || !isObject(value.asset_folder)) {
    return null;
  }

  return parseAssetFolderValue(value.asset_folder);
}

function parseAssetFolderValue(value: unknown): KyronAssetFolder | null {
  if (!isObject(value)) {
    return null;
  }

  const { id, name, parent_id, created_at, updated_at } = value;

  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof name !== "string" ||
    !(parent_id === null || isPositiveInteger(parent_id)) ||
    typeof created_at !== "string" ||
    typeof updated_at !== "string"
  ) {
    return null;
  }

  return { id, name, parent_id, created_at, updated_at };
}

function parsePaginationMeta(value: unknown): KyronPaginationMeta | null {
  if (!isObject(value)) {
    return null;
  }

  const {
    current_page,
    next_page,
    prev_page,
    total_pages,
    total_count,
  } = value;

  if (
    !isPositiveInteger(current_page) ||
    !(next_page === null || isPositiveInteger(next_page)) ||
    !(prev_page === null || isPositiveInteger(prev_page)) ||
    !isNonNegativeInteger(total_pages) ||
    !isNonNegativeInteger(total_count)
  ) {
    return null;
  }

  return {
    current_page,
    next_page,
    prev_page,
    total_pages,
    total_count,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}
