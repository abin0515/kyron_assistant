import { parseJsonResponse } from "@/features/drafts/shared/api-response";
import type {
  CreateKyronAssetFolderRequest,
  KyronAssetFolderItem,
  KyronAssetFolderListResponse,
  KyronAssetFolderResponse,
} from "@/types/api";

export async function listKyronFolders(
  parentId: number | null,
  page = 1,
  signal?: AbortSignal,
): Promise<KyronAssetFolderListResponse> {
  const query = new URLSearchParams({
    page: String(page),
    per_page: "25",
  });

  if (parentId !== null) {
    query.set("parent_id", String(parentId));
  }

  const response = await fetch(`/api/kyron-folders?${query}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<KyronAssetFolderListResponse>(response);
}

export async function createKyronFolder(
  name: string,
  parentId: number | null,
  signal?: AbortSignal,
): Promise<KyronAssetFolderItem> {
  const body = {
    name,
    ...(parentId ? { parentId } : {}),
  } satisfies CreateKyronAssetFolderRequest;
  const response = await fetch("/api/kyron-folders", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return (await parseJsonResponse<KyronAssetFolderResponse>(response)).folder;
}
