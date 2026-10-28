import { NextRequest, NextResponse } from "next/server";

import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
} from "@/server/http/api-response";
import {
  extractCurrentUserSourceFileText,
  SourceFileExtractionInProgressError,
  SourceFileExtractionValidationError,
} from "@/server/source-files/service";
import type { ExtractSourceFileTextResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractSourceFileRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: ExtractSourceFileRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const id = await readSourceFileId(context);

  if (!id) {
    return requestErrorResponse("Source file ID is invalid.");
  }

  try {
    const sourceFile = await extractCurrentUserSourceFileText(id);

    if (!sourceFile) {
      return notFoundErrorResponse("Source file was not found.");
    }

    if (!sourceFile.extractedText || !sourceFile.extractedAt) {
      throw new Error("The extracted source file result is incomplete.");
    }

    const response = {
      file: {
        id: sourceFile.id,
        processingStatus: "ready",
        statusMessage: sourceFile.statusMessage,
        extractedAt: sourceFile.extractedAt,
        extractedCharacterCount: sourceFile.extractedText.length,
      },
    } satisfies ExtractSourceFileTextResponse;

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof SourceFileExtractionValidationError) {
      return requestErrorResponse(error.message, 422);
    }

    if (error instanceof SourceFileExtractionInProgressError) {
      return conflictErrorResponse(error.message, true);
    }

    return internalErrorResponse(error, {
      context: "Source file text extraction failed",
      fallbackMessage: "The source file text could not be extracted.",
      retryable: true,
    });
  }
}

async function readSourceFileId(
  context: ExtractSourceFileRouteContext,
): Promise<string | null> {
  const { id } = await context.params;

  return isUuid(id) ? id : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}
