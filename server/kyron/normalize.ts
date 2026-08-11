import type { Draft } from "@/types/api";

import type { KyronLessonCollection } from "./contracts";

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
