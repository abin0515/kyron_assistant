import type { Draft, KyronAssetFolderItem } from "@/types/api";

import type {
  KyronAssetFolder,
  KyronLessonCollection,
} from "./contracts";

export function toDraft(collection: KyronLessonCollection): Draft {
  return {
    id: collection.id,
    name: collection.name,
    status: collection.status,
    statusMessage: collection.status_message,
    previewUrl: collection.preview_url,
    editorUrl: collection.editor_url,
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
  };
}

export function toKyronAssetFolderItem(
  folder: KyronAssetFolder,
): KyronAssetFolderItem {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parent_id,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
  };
}
