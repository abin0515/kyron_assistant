import { NextRequest, NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import {
  toSourceFileContentType,
  toSourceFileListItem,
} from "@/server/source-files/api";
import {
  paginationMeta,
  parsePageRequest,
} from "@/server/http/pagination";
import { listCurrentUserSourceFiles } from "@/server/source-files/service";
import type {
  SourceFileListResponse,
  SourceFileType,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filter = parseSourceFileFilter(request.nextUrl.searchParams);

  if (!filter) {
    return requestErrorResponse("Source file filters are invalid.");
  }

  try {
    const page = parsePageRequest(request.nextUrl.searchParams);
    const result = await listCurrentUserSourceFiles(page, filter);
    const response = {
      files: result.items.map((sourceFile) =>
        toSourceFileListItem(sourceFile, sourceFile.workspaceCount),
      ),
      pagination: paginationMeta(page, result.totalCount),
      summary: result.summary,
    } satisfies SourceFileListResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Source file list request failed",
      fallbackMessage: "The source file list could not be loaded.",
      retryable: true,
    });
  }
}

function parseSourceFileFilter(searchParams: URLSearchParams) {
  const query = searchParams.get("query")?.trim() ?? "";
  const types = (searchParams.get("types") ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  if (query.length > 120 || types.some((type) => !isSourceFileType(type))) {
    return null;
  }

  return {
    contentTypes: types.map((type) =>
      toSourceFileContentType(type as SourceFileType),
    ),
    query,
  };
}

function isSourceFileType(value: string): value is SourceFileType {
  return value === "pdf" || value === "pptx" || value === "docx";
}
