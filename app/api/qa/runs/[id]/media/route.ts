import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { MEDIA_UPLOAD_UNAVAILABLE, mediaUploadAvailable } from "@/server/qa/media-upload";
import { attachMedia } from "@/server/qa/service";
import type { QaRunDetailResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Run ID is invalid.");
  }

  // Answered before the body is read: Vercel refuses bodies over 4.5 MB and
  // has no lasting disk to keep the file for the later check.
  if (!mediaUploadAvailable()) {
    return requestErrorResponse(MEDIA_UPLOAD_UNAVAILABLE, 501);
  }

  try {
    const user = await getCurrentUser();
    const file = (await request.formData()).get("file");

    if (!(file instanceof File)) {
      return requestErrorResponse("Attach a video or audio file.");
    }

    return qaJson(
      (await attachMedia(id, {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }, user)) satisfies QaRunDetailResponse,
    );
  } catch (error) {
    return qaErrorResponse(error, "QA media upload failed");
  }
}
