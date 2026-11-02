import { NextRequest } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { getCurrentUser } from "@/server/identity/current-user";
import {
  isRecordId,
  parseLessonContentRequest,
  qaErrorResponse,
  qaJson,
  readJson,
  type QaRouteContext,
} from "@/server/qa/http";
import { importWorkspaceLessonContent } from "@/server/qa/service";
import type { QaWorkspaceQaResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Until Kyron MCP lesson access exists, the generated lesson is pasted here.
export async function POST(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Workspace ID is invalid.");
  }

  try {
    const body = parseLessonContentRequest(await readJson(request));

    if (!body) {
      return requestErrorResponse("Provide the generated lesson content as a JSON packet.");
    }

    return qaJson(
      (await importWorkspaceLessonContent({
        packet: body.packet,
        user: await getCurrentUser(),
        workspaceId: id,
      })) satisfies QaWorkspaceQaResponse,
      201,
    );
  } catch (error) {
    return qaErrorResponse(error, "Lesson content import failed");
  }
}
