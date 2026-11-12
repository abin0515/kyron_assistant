import { NextRequest, NextResponse } from "next/server";

import {
  internalErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { cancelCurrentUserSourceFileUpload } from "@/server/source-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRouteContext = {
  params: Promise<{
    uploadId: string;
  }>;
};

// The page stopped an upload (the file was removed, or it is tried again), so
// the file's name can be uploaded again right away.
export async function DELETE(
  request: NextRequest,
  context: UploadRouteContext,
) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { uploadId } = await context.params;

  if (!isUuid(uploadId)) {
    return requestErrorResponse("Upload ID is invalid.");
  }

  try {
    await cancelCurrentUserSourceFileUpload(uploadId);

    return new NextResponse(null, {
      status: 204,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "Source file upload cancellation failed",
      fallbackMessage: "The upload could not be cancelled.",
      retryable: true,
    });
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
