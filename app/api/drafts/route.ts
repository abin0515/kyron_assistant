import { NextRequest, NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import {
  listCurrentUserDrafts,
  listCurrentUserDraftsByIds,
} from "@/server/drafts/kyron-drafts/service";
import {
  paginationMeta,
  parsePageRequest,
} from "@/server/http/pagination";
import type { DraftListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const requestedIds = request.nextUrl.searchParams.get("ids");

    if (requestedIds !== null) {
      const draftIds = parseDraftIds(requestedIds);

      if (!draftIds) {
        return requestErrorResponse("Draft IDs are invalid.");
      }

      const drafts = await listCurrentUserDraftsByIds(draftIds);
      const response = {
        drafts,
        pagination: {
          page: 1,
          perPage: draftIds.length,
          totalCount: drafts.length,
          totalPages: drafts.length > 0 ? 1 : 0,
        },
      } satisfies DraftListResponse;

      return NextResponse.json(response, {
        headers: noStoreHeaders,
      });
    }

    const page = parsePageRequest(request.nextUrl.searchParams);
    const result = await listCurrentUserDrafts(page);
    const response = {
      drafts: result.items,
      pagination: paginationMeta(page, result.totalCount),
    } satisfies DraftListResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Draft list request failed",
      fallbackMessage: "The draft list could not be loaded.",
      retryable: true,
    });
  }
}

function parseDraftIds(value: string): number[] | null {
  const values = value.split(",");

  if (values.length === 0 || values.length > 50) {
    return null;
  }

  const ids = values.map(Number);

  if (
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    return null;
  }

  return ids;
}
