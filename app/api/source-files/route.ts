import { NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
} from "@/server/http/api-response";
import { toSourceFileListItem } from "@/server/source-files/api";
import { listCurrentUserSourceFiles } from "@/server/source-files/service";
import type { SourceFileListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sourceFiles = await listCurrentUserSourceFiles();
    const response = {
      files: sourceFiles.map((sourceFile) =>
        toSourceFileListItem(sourceFile, sourceFile.workspaceCount),
      ),
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
