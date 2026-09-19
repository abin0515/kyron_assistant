import { NextRequest, NextResponse } from "next/server";

import {
  kyronErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import {
  createKyronAssetFolder,
  listKyronAssetFolders,
} from "@/server/kyron/client";
import { toKyronAssetFolderItem } from "@/server/kyron/normalize";
import type {
  CreateKyronAssetFolderRequest,
  KyronAssetFolderListResponse,
  KyronAssetFolderResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = parseFolderListQuery(request.nextUrl.searchParams);

  if (!query) {
    return requestErrorResponse("Folder query parameters are invalid.");
  }

  try {
    const result = await listKyronAssetFolders({
      parent_id: query.parentId,
      page: query.page,
      per_page: query.perPage,
    });
    const response = {
      folders: result.asset_folders.map(toKyronAssetFolderItem),
      pagination: {
        page: result.meta.current_page,
        perPage: query.perPage,
        totalCount: result.meta.total_count,
        totalPages: result.meta.total_pages,
      },
    } satisfies KyronAssetFolderListResponse;

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron folder list request failed",
      fallbackMessage: "The Kyron folders could not be loaded.",
    });
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const parsed = parseCreateFolderRequest(await readJson(request));

  if ("errors" in parsed) {
    return validationErrorResponse(parsed.errors);
  }

  try {
    const folder = await createKyronAssetFolder({
      name: parsed.input.name,
      parent_id: parsed.input.parentId,
    });
    const response = {
      folder: toKyronAssetFolderItem(folder),
    } satisfies KyronAssetFolderResponse;

    return NextResponse.json(response, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron folder creation failed",
      fallbackMessage: "The Kyron folder could not be created.",
    });
  }
}

function parseFolderListQuery(searchParams: URLSearchParams) {
  const parentId = optionalPositiveInteger(searchParams.get("parent_id"));
  const page = positiveInteger(searchParams.get("page"), 1);
  const perPage = positiveInteger(searchParams.get("per_page"), 25);

  if (parentId === "invalid" || !page || !perPage || perPage > 50) {
    return null;
  }

  return {
    parentId: parentId ?? undefined,
    page,
    perPage,
  };
}

function parseCreateFolderRequest(
  value: unknown,
):
  | { input: CreateKyronAssetFolderRequest }
  | { errors: Record<string, string[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { request: ["Request body must be an object."] } };
  }

  const body = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parentId = optionalPositiveInteger(body.parentId);

  if (!name || name.length > 255) {
    errors.name = ["Folder name must be between 1 and 255 characters."];
  }

  if (parentId === "invalid") {
    errors.parentId = ["Parent folder ID must be a positive integer."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    input: {
      name,
      parentId: parentId === "invalid" ? undefined : parentId,
    },
  };
}

async function readJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  try {
    return Boolean(origin && new URL(origin).origin === request.nextUrl.origin);
  } catch {
    return false;
  }
}

function positiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) {
    return fallback;
  }

  return isPositiveInteger(value) ? Number(value) : null;
}

function optionalPositiveInteger(
  value: unknown,
): number | undefined | "invalid" {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (
    (typeof value === "string" || typeof value === "number") &&
    isPositiveInteger(String(value))
  ) {
    return Number(value);
  }

  return "invalid";
}

function isPositiveInteger(value: string): boolean {
  return (
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}
